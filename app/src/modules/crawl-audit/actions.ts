"use server";

import { createSupabaseServerClient } from "@/lib/db";
import { getOrRunCrawlAudit, getLatestCrawlAudit } from "./crawl-audit";
import type { AuditActionState } from "./types";

// Matches the pattern in app/src/app/brands/new/actions.ts: check the caller
// is signed in and return a clean error if not; the actual authorization for
// *which* brand/workspace they may touch is left to RLS on crawl_audits
// (private.is_workspace_member / private.has_workspace_role), not
// reimplemented here. This is a defense-in-depth guard against an
// unauthenticated caller hitting the DB and getting a raw Postgres RLS
// error string back, not a replacement for RLS.
async function requireSignedIn(): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }
  return null;
}

/**
 * Server Action: Run a crawl-readiness audit for a brand.
 * Called from the CrawlAuditTrigger component in the Reports view.
 * Cache-aware: getOrRunCrawlAudit returns the existing audit row without a
 * new fetch if it's under 24h old, per the module's caching spec. If a
 * customer needs to force a fresh audit before 24h are up, that's a
 * deliberate future addition, not something silently folded in here.
 */
export async function runCrawlAuditAction(
  brandId: string,
  websiteUrl: string
): Promise<AuditActionState> {
  const authError = await requireSignedIn();
  if (authError) return authError;

  try {
    const audit = await getOrRunCrawlAudit(brandId, websiteUrl);
    return { ok: true, audit };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error running crawl audit";
    return { error: message };
  }
}

/**
 * Server Action: Fetch the latest crawl audit for a brand.
 * Called from the Reports page to display existing audit data.
 */
export async function getLatestCrawlAuditAction(
  brandId: string
): Promise<{ ok: true; audit: Awaited<ReturnType<typeof getLatestCrawlAudit>> } | { error: string }> {
  const authError = await requireSignedIn();
  if (authError) return authError;

  try {
    const audit = await getLatestCrawlAudit(brandId);
    return { ok: true, audit };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error fetching crawl audit";
    return { error: message };
  }
}