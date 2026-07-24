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
 * Proves cross-tenant access is denied by RLS (docs/CONVENTIONS.md Section 6,
 * item 1) — this is the template every later module's own RLS test should
 * copy, per Module 5.1's Security note.
 *
 * Requires a LIVE Supabase project with migration 0001 applied, plus these
 * three env vars set: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY. Skips automatically (not a failure) when they
 * aren't present — see progress/modules/5.1-auth-and-account.md Blockers for
 * what still needs to happen before this can run in CI.
 */
const maybeDescribe = canRun ? describe : describe.skip;

maybeDescribe("5.1 RLS: cross-tenant workspace access is denied", () => {
  const admin = createClient<Database>(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "");
  const passwordA = `Test-${randomUUID()}`;
  const passwordB = `Test-${randomUUID()}`;
  let userAEmail = "";
  let userBEmail = "";
  let userAId = "";
  let userBId = "";
  let workspaceAId = "";

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
  });

  after(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("lets user A read their own workspace", async () => {
    const anonForA = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForA.auth.signInWithPassword({ email: userAEmail, password: passwordA });
    const { data, error } = await anonForA.from("workspaces").select("id").eq("id", workspaceAId);
    assert.equal(error, null);
    assert.equal(data?.length, 1);
  });

  it("denies user B reading user A's workspace", async () => {
    const anonForB = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForB.auth.signInWithPassword({ email: userBEmail, password: passwordB });
    const { data, error } = await anonForB.from("workspaces").select("id").eq("id", workspaceAId);
    // RLS filters rows out silently rather than erroring — zero rows is the
    // expected "denied" outcome here, not a thrown error.
    assert.equal(error, null);
    assert.equal(data?.length, 0);
  });

  it("denies user B reading user A's workspace_members row", async () => {
    const anonForB = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForB.auth.signInWithPassword({ email: userBEmail, password: passwordB });
    const { data, error } = await anonForB
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceAId);
    assert.equal(error, null);
    assert.equal(data?.length, 0);
  });

  it("denies user B inserting themselves into user A's workspace", async () => {
    const anonForB = createClient<Database>(SUPABASE_URL ?? "", ANON_KEY ?? "");
    await anonForB.auth.signInWithPassword({ email: userBEmail, password: passwordB });
    const { error } = await anonForB
      .from("workspace_members")
      .insert({ workspace_id: workspaceAId, user_id: userBId, role: "owner" });
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
