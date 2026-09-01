import { PLAN_CATALOG } from "@/modules/billing/plans";

/**
 * "How it works" / feature guide — Module 5.6 follow-up.
 *
 * Static, always-available reference page answering "what does this product
 * actually do and how does a check happen" -- added because there was no
 * in-app page explaining the pipeline or which AI model/quota backs which
 * feature; the only way to see it before was to read the source. Plan data
 * is pulled live from PLAN_CATALOG (modules/billing/plans.ts) so the pricing
 * table can't drift from the real enforced limits; the AI model/quota table
 * below is a documented snapshot (see modules/admin/quota-caps.ts for the
 * numbers actually used by the admin console's live logic) rather than a
 * live DB read, since ai_task_configs is only readable through the
 * admin-gated queries. See progress/modules/5.6-dashboard-frontend.md
 * decisions log, 2026-08-14 entry.
 */
export default function HelpPage() {
  const planTiers = ["free", "starter", "growth", "agency"] as const;

  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-16">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">How it works</h1>
        <p className="text-[var(--color-text-secondary)] mt-2">
          What this product does, how a check actually happens, and which AI model powers each part
          of it.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-[var(--color-text-primary)]">What this is</h2>
        <p className="text-[var(--color-text-secondary)]">
          AEO Visibility Platform tracks whether AI answer engines (Google&apos;s Gemini-grounded
          search today) mention and recommend your brand versus named competitors when someone asks
          one of your tracked prompts, explains why a competitor is winning when they are, and
          reports what to fix.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-[var(--color-text-primary)]">The check pipeline</h2>
        <ol className="space-y-3 text-[var(--color-text-secondary)]">
          <li>
            <span className="font-medium text-[var(--color-text-primary)]">1. A prompt runs.</span>{" "}
            Each tracked prompt is sent to Gemini with Google Search grounding enabled — the same
            grounded-search capability behind AI Overviews — so the answer reflects what a real user
            asking that question would see today, with real citations.
          </li>
          <li>
            <span className="font-medium text-[var(--color-text-primary)]">
              2. The answer is extracted.
            </span>{" "}
            The raw AI answer is parsed to find whether your brand was mentioned, where, and which
            named competitors also showed up, plus which domains were cited.
          </li>
          <li>
            <span className="font-medium text-[var(--color-text-primary)]">
              3. It&apos;s scored and explained.
            </span>{" "}
            A visibility score and share-of-voice are computed against your competitors, and when a
            competitor is ahead, a plain-language explanation of why is generated.
          </li>
          <li>
            <span className="font-medium text-[var(--color-text-primary)]">
              4. It shows up in your dashboard.
            </span>{" "}
            Results land in Overview, Prompt Explorer, and Competitor Explorer — every number has a
            &quot;How we calculated this&quot; disclosure you can open to see the underlying data.
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-[var(--color-text-primary)]">
          What each page shows
        </h2>
        <dl className="space-y-3 text-[var(--color-text-secondary)]">
          <div>
            <dt className="font-medium text-[var(--color-text-primary)]">📊 Overview</dt>
            <dd>Your brand&apos;s current visibility score, share-of-voice, and recent trend.</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--color-text-primary)]">💬 Prompt Explorer</dt>
            <dd>
              Every tracked prompt, per-prompt results, and — for the site admin — a way to run a
              real check right now and watch the AI&apos;s actual answer come back.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--color-text-primary)]">🏢 Competitor Explorer</dt>
            <dd>How often each named competitor shows up and how you compare (paid plans).</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--color-text-primary)]">📄 Reports</dt>
            <dd>Scheduled and on-demand PDF/CSV exports of your visibility data (paid plans).</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--color-text-primary)]">⚙️ Settings</dt>
            <dd>Brand, competitor, and prompt management, plus billing.</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-[var(--color-text-primary)]">
          Which AI model backs each feature
        </h2>
        <p className="text-[var(--color-text-secondary)]">
          Every AI call in this product runs on free-tier quota today, split across two providers so
          a limit on one doesn&apos;t stop everything. The real bottleneck right now is
          Google&apos;s Search-grounding tool quota specifically (not the base model&apos;s request
          limit) — it&apos;s far stricter on an unbilled Google Cloud project, so live checks can
          come back rate-limited even though the product code is working correctly.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-[var(--color-border)] rounded-lg overflow-hidden">
            <thead className="bg-[var(--color-surface-1)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-primary)]">
                  Feature
                </th>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-primary)]">
                  Model
                </th>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-primary)]">
                  Approx. free-tier limit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              <tr>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  Running a check (grounded search)
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-primary)]">
                  gemini-3.5-flash-lite
                </td>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  ~15 rpm / 1000 rpd (base model) — grounding tool quota is stricter and is the real
                  limit today
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  AI-suggested prompts
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-primary)]">
                  gemini-2.5-flash-lite
                </td>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  Healthy, separate quota
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  Extracting brand/competitor mentions
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-primary)]">
                  meta/llama-3.1-8b-instruct (NVIDIA NIM)
                </td>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  ~40 rpm, no published daily cap — healthy
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  Explaining why a competitor is ahead
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-primary)]">
                  meta/llama-3.1-8b-instruct (NVIDIA NIM)
                </td>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  ~40 rpm, no published daily cap — healthy
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Figures are approximate free-tier reference numbers, not a live feed — see the Admin
          Console&apos;s Quota Consumption panel for real-time usage.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-[var(--color-text-primary)]">Plans</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-[var(--color-border)] rounded-lg overflow-hidden">
            <thead className="bg-[var(--color-surface-1)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-primary)]">
                  Plan
                </th>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-primary)]">
                  Price
                </th>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-primary)]">
                  Brands
                </th>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-primary)]">
                  Prompts
                </th>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-primary)]">
                  Checks
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {planTiers.map((tier) => {
                const plan = PLAN_CATALOG[tier];
                return (
                  <tr key={tier}>
                    <td className="px-3 py-2 text-[var(--color-text-primary)] font-medium">
                      {plan.name}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {plan.priceUsdDisplay}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {plan.brandLimit}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {plan.promptLimit}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {plan.checkFrequency === "on-demand"
                        ? "3 lifetime on-demand"
                        : plan.checkFrequency}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Self-serve upgrades are on hold while payments are still in testing — see Settings →
          Billing.
        </p>
      </section>
    </div>
  );
}
