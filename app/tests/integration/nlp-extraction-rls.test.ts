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
 * Proves cross-tenant access is denied by RLS for check_extractions
 * (docs/CONVENTIONS.md Section 6, item 1) — copies the structure of
 * auth-rls.test.ts exactly, per Module 5.1's Security note.
 *
 * Requires a LIVE Supabase project with migration 0013 applied, plus these
 * three env vars set: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY. Skips automatically (not a failure) when they
 * aren't present.
 */
const maybeDescribe = canRun ? describe : describe.skip;

maybeDescribe("5.4 RLS: cross-tenant check_extractions access is denied", () => {
  const admin = createClient<Database>(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "");
  const passwordA = `Test-${randomUUID()}`;
  const passwordB = `Test-${randomUUID()}`;
  let userAEmail = "";
  let userBEmail = "";
  let userAId = "";
  let userBId = "";
  let workspaceAId = "";
  let brandAId = "";
  let promptAId = "";
  let checkRunAId = "";
  let extractionAId = "";

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

    // Create brand + prompt via the SECURITY INVOKER RPC (runs under user A's RLS)
    const { data: brandId, error: brandErr } = await anonForA.rpc("create_brand_with_details", {
      p_workspace_id: workspaceAId,
      p_name: "Acme Corp",
      p_website: "",
      p_competitor_names: [],
      p_prompt_texts: ["Best CRM for small business"],
      p_prompts_ai_suggested: true,
    });
    if (brandErr || !brandId) throw brandErr ?? new Error("failed to create test brand");
    brandAId = brandId;

    // Read back the created prompt's id
    const { data: promptRow, error: promptErr } = await anonForA
      .from("prompts")
      .select("id")
      .eq("brand_id", brandAId)
      .single();
    if (promptErr || !promptRow) throw promptErr ?? new Error("failed to read back prompt id");
    promptAId = promptRow.id;

    // Using admin client: insert check_runs row (no client insert policy on check_runs)
    // This fires the check_runs_enqueue_extraction trigger, which inserts check_extractions
    const { data: checkRunRow, error: crErr } = await admin
      .from("check_runs")
      .insert({
        workspace_id: workspaceAId,
        brand_id: brandAId,
        prompt_id: promptAId,
        provider: "gemini",
        model: "test-model",
        raw_answer: "Acme Corp is a great CRM.",
        status: "success",
      })
      .select("id")
      .single();
    if (crErr || !checkRunRow) throw crErr ?? new Error("failed to insert check_runs row");
    checkRunAId = checkRunRow.id;

    // Read back the auto-created extraction row id
    const { data: extractionRow, error: extErr } = await admin
      .from("check_extractions")
      .select("id")
      .eq("check_run_id", checkRunAId)
      .single();
    if (extErr || !extractionRow) throw extErr ?? new Error("failed to read back extraction id");
    extractionAId = extractionRow.id;
  });

  after(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("lets a workspace member read their own workspace's check_extractions row", async () => {
    const anonForA = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForA.auth.signInWithPassword({ email: userAEmail, password: passwordA });
    const { data, error } = await anonForA
      .from("check_extractions")
      .select("id")
      .eq("id", extractionAId);
    assert.equal(error, null);
    assert.equal(data?.length, 1);
  });

  it("denies a non-member reading another workspace's check_extractions row", async () => {
    const anonForB = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForB.auth.signInWithPassword({ email: userBEmail, password: passwordB });
    const { data, error } = await anonForB
      .from("check_extractions")
      .select("id")
      .eq("id", extractionAId);
    // RLS filters rows out silently rather than erroring — zero rows is the
    // expected "denied" outcome here, not a thrown error.
    assert.equal(error, null);
    assert.equal(data?.length, 0);
  });

  it("denies a non-member inserting into check_extractions", async () => {
    const anonForB = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForB.auth.signInWithPassword({ email: userBEmail, password: passwordB });
    const { error } = await anonForB.from("check_extractions").insert({
      check_run_id: randomUUID(),
      workspace_id: workspaceAId,
      brand_id: brandAId,
      prompt_id: promptAId,
    });
    // This one *should* error: RLS's WITH CHECK clause on INSERT rejects the
    // row outright rather than silently dropping it. Assert the specific
    // Postgres code for an RLS policy violation (42501), not just "some
    // error happened" — a bare not-null check previously let the
    // workspace_members infinite-recursion bug (42P17) masquerade as a
    // passing test, since a recursion error is still "an error".
    assert.notEqual(error, null);
    assert.equal(error?.code, "42501");
  });
});
