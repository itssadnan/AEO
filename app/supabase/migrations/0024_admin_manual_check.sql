-- Migration 0024: allow an 'admin_manual' check_jobs.source value.
--
-- Lets the site admin (requireAdmin()-gated, see src/lib/security/admin.ts)
-- manually queue a check on ANY workspace regardless of plan tier, for
-- testing the full check pipeline without a real Razorpay payment. The
-- customer-facing enqueue_free_check() RPC intentionally only allows
-- free-tier workspaces (paid tiers get scheduled checks instead) -- this is
-- a separate, admin-only path that bypasses that restriction at the
-- application layer (adminEnqueueCheckAction in modules/admin/actions.ts),
-- not a change to enqueue_free_check itself. See
-- progress/modules/5.9-billing-and-subscription.md decisions log,
-- 2026-08-14 entry, for the full context.

alter table public.check_jobs drop constraint check_jobs_source_check;
alter table public.check_jobs add constraint check_jobs_source_check
  check (source in ('scheduled', 'free_on_demand', 'public_free_check', 'growth_automation', 'admin_manual'));
