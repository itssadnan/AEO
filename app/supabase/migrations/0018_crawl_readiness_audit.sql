-- Module 5.7: Crawl-Readiness Audit
--
-- crawl_audits table. RLS follows the same pattern as migration 0005:
-- workspace membership checked via private.is_workspace_member() /
-- private.has_workspace_role() SECURITY DEFINER helpers, with
-- private.brand_workspace_id() resolving the brand's workspace.
--
-- Design decisions (see progress/modules/5.7-crawl-readiness-audit.md):
--   1. heading_structure is its own jsonb column, not a boolean, because it
--      needs to report per-heading-tag detail (e.g. how many <h1>s were
--      found), not just pass/fail, so the checklist's fix instructions can
--      be specific.
--   2. No update or delete policy: audit rows are an immutable historical
--      log. A new audit is always a new row, never an edit to a prior one.
--   3. robots_txt_result is jsonb for the same reason as heading_structure:
--      it reports per-bot detail (allowed/blocked for each of the 5 audited
--      bots), not a single boolean.

-- ============================================================================
-- crawl_audits
-- ============================================================================
create table public.crawl_audits (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  domain text not null,                    -- normalized hostname actually audited, e.g. "example.com"
  robots_txt_result jsonb not null,         -- see RobotsTxtResult shape in app/src/modules/crawl-audit/schemas.ts
  llms_txt_present boolean not null default false,
  schema_present boolean not null default false,
  heading_structure jsonb not null,         -- see HeadingStructureResult shape in app/src/modules/crawl-audit/schemas.ts
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index crawl_audits_brand_id_checked_at_idx
  on public.crawl_audits (brand_id, checked_at desc);

alter table public.crawl_audits enable row level security;

create policy "crawl_audits_select_member"
  on public.crawl_audits for select
  using (private.is_workspace_member(private.brand_workspace_id(brand_id), auth.uid()));

create policy "crawl_audits_insert_owner_or_member"
  on public.crawl_audits for insert
  with check (
    private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'owner')
    or private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'member')
  );

-- No update or delete policy: audit rows are an immutable historical log.
-- A new audit is always a new row, never an edit to a prior one -- this is
-- what makes "last checked" and history meaningful, and matches how
-- check_runs/visibility_snapshots are treated elsewhere in this schema.