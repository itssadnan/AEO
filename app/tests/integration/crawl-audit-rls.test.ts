import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.ts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const canRun = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

/**
 * Proves cross-tenant access is denied by RLS for crawl_audits
 * (docs/CONVENTIONS.md Section 6, item 1) — copies the structure of
 * auth-rls.test.ts / nlp-extraction-rls.test.ts exactly, per Module 5.1's
 * Security note.
 *
 * Requires a LIVE Supabase project with migration 0018 applied, plus these
 * three env vars set: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY. Skips automatically (not a failure) when they
 * aren't present.
 */
const maybeDescribe = canRun ? describe : describe.skip;

maybeDescribe("5.7 RLS: cross-tenant crawl_audits access is denied", () => {
  const admin = createClient<Database>(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "");
  const passwordA = `Test-${randomUUID()}`;
  const passwordB = `Test-${randomUUID()}`;
  let userAEmail = "";
  let userBEmail = "";
  let userAId = "";
  let userBId = "";
  let workspaceAId = "";
  let brandAId = "";
  let auditAId = "";

  before(async () => {
    userAEmail = `rls-test-a-${randomUUID()}@example.com`;
    userBEmail = `rls-test-b-${randomUUID()}@example.com`;

    const { data: userA, error: errA } = await admin.auth.admin.createUser({
      email: userAEmail,
      password: passwordA,
      email_confirm: true,
    });
    if (errA || !userA.user) throw errA ?? new Error("failed to create test user A");
    userAId = userA.user.id;

    const { data: userB, error: errB } = await admin.auth.admin.createUser({
      email: userBEmail,
      password: passwordB,
      email_confirm: true,
    });
    if (errB || !userB.user) throw errB ?? new Error("failed to create test user B");
    userBId = userB.user.id;

    const anonForA = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForA.auth.signInWithPassword({ email: userAEmail, password: passwordA });
    const { data: wsId, error: wsErr } = await anonForA.rpc("create_workspace", {
      p_name: "RLS test workspace A",
    });
    if (wsErr || !wsId) throw wsErr ?? new Error("failed to create test workspace A");
    workspaceAId = wsId;

    // Create brand A via the SECURITY INVOKER RPC (runs under user A's RLS)
    const { data: brandId, error: brandErr } = await anonForA.rpc("create_brand_with_details", {
      p_workspace_id: workspaceAId,
      p_name: "Acme Corp",
      p_website: "https://example.com",
      p_competitor_names: [],
      p_prompt_texts: ["Best CRM for small business"],
      p_prompts_ai_suggested: true,
    });
    if (brandErr || !brandId) throw brandErr ?? new Error("failed to create test brand");
    brandAId = brandId;

    // Insert a crawl_audits row as user A — same insert path runCrawlAuditAction
    // uses (session-scoped client, not service role), so this also exercises
    // the insert policy itself, not just admin-seeded fixtures.
    const { data: auditRow, error: auditErr } = await anonForA
      .from("crawl_audits")
      .insert({
        brand_id: brandAId,
        domain: "example.com",
        robots_txt_result: { bots: { GPTBot: { allowed: true } } },
        llms_txt_present: false,
        schema_present: false,
        heading_structure: {
          h1_count: 1,
          h2_count: 0,
          h3_count: 0,
          h4_count: 0,
          h5_count: 0,
          h6_count: 0,
          has_multiple_h1: false,
        },
      })
      .select("id")
      .single();
    if (auditErr || !auditRow) throw auditErr ?? new Error("failed to insert crawl_audits row");
    auditAId = auditRow.id;
  });

  after(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("lets a workspace member read their own workspace's crawl_audits row", async () => {
    const anonForA = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForA.auth.signInWithPassword({ email: userAEmail, password: passwordA });
    const { data, error } = await anonForA
      .from("crawl_audits")
      .select("id")
      .eq("id", auditAId);
    assert.equal(error, null);
    assert.equal(data?.length, 1);
  });

  it("denies a non-member reading another workspace's crawl_audits row", async () => {
    const anonForB = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForB.auth.signInWithPassword({ email: userBEmail, password: passwordB });
    const { data, error } = await anonForB
      .from("crawl_audits")
      .select("id")
      .eq("id", auditAId);
    // RLS filters rows out silently rather than erroring — zero rows is the
    // expected "denied" outcome here, not a thrown error.
    assert.equal(error, null);
    assert.equal(data?.length, 0);
  });

  it("denies a non-member inserting a crawl_audits row for another workspace's brand", async () => {
    const anonForB = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForB.auth.signInWithPassword({ email: userBEmail, password: passwordB });
    const { error } = await anonForB.from("crawl_audits").insert({
      brand_id: brandAId,
      domain: "example.com",
      robots_txt_result: { bots: {} },
      heading_structure: {
        h1_count: 0,
        h2_count: 0,
        h3_count: 0,
        h4_count: 0,
        h5_count: 0,
        h6_count: 0,
        has_multiple_h1: false,
      },
    });
    // WITH CHECK on insert rejects the row outright — assert the specific
    // Postgres RLS-violation code (42501), not just "some error happened",
    // per the same lesson nlp-extraction-rls.test.ts already documents.
    assert.notEqual(error, null);
    assert.equal(error?.code, "42501");
  });

  it("denies a non-member updating or deleting another workspace's crawl_audits row", async () => {
    // crawl_audits has no update/delete policy at all (immutable audit log,
    // per migration 0018's own design decision) -- confirm both are denied
    // for a non-member the same way, not just "no policy exists so nothing
    // happens": RLS with no permissive policy for an operation denies it
    // outright, which for UPDATE/DELETE surfaces as zero rows affected, not
    // an error (same "silently filtered" shape as the SELECT case above).
    const anonForB = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForB.auth.signInWithPassword({ email: userBEmail, password: passwordB });

    const { data: updateData, error: updateError } = await anonForB
      .from("crawl_audits")
      .update({ domain: "hijacked.example.com" })
      .eq("id", auditAId)
      .select("id");
    assert.equal(updateError, null);
    assert.equal(updateData?.length, 0);

    const { data: deleteData, error: deleteError } = await anonForB
      .from("crawl_audits")
      .delete()
      .eq("id", auditAId)
      .select("id");
    assert.equal(deleteError, null);
    assert.equal(deleteData?.length, 0);
  });
});
