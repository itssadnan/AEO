// Module 5.8 — Alerting & Reporting worker.
// Deploy with: supabase functions deploy alerting-worker --no-verify-jwt
// Invoked weekly by pg_cron/pg_net (migration 0022), same pattern as
// engine-worker/extraction-worker/scoring-worker. Protected by
// ALERTING_WORKER_SECRET (Vault + Edge Function secret), not a Supabase
// session JWT.
//
// Unlike the other workers, this one has no queue table to claim from --
// get_weekly_digest_candidates()/get_new_threshold_alerts() (migration 0021)
// are pure, synchronous SQL reads. The only genuinely external step is the
// Resend API call below.
//
// RESEND_API_KEY is deliberately allowed to be unset: this project has no
// Resend account yet (see progress/modules/5.8-alerting-and-reporting.md
// Blockers). Rather than fail the whole invocation, every send path checks
// for the key first and, if missing, logs a clear warning and skips sending
// (and, critically, does NOT call record_alert_sent -- nothing was actually
// sent, so nothing should be marked as sent/deduped). This lets the worker
// deploy and run safely today, and starts actually emailing the moment a
// real key is set as an Edge Function secret -- same "build now, plug in the
// real secret later" pattern this project used for Module 5.3's Gemini keys.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("ALERTING_WORKER_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Placeholder sender until a real domain is verified with Resend (needs SPF/
// DKIM/DMARC per docs/CONVENTIONS.md Section 6) -- overridable via env so the
// user can point it at a real verified address without a code change.
const FROM_EMAIL =
  Deno.env.get("ALERTING_FROM_EMAIL") ?? "AEO Visibility <alerts@aeo-visibility.example>";

type DigestCandidate = {
  brand_id: string;
  workspace_id: string;
  brand_name: string;
  current_score: number;
  prior_score: number | null;
  score_change: number;
  new_mentions: { prompt_id: string; prompt_text: string }[];
  lost_mentions: { prompt_id: string; prompt_text: string }[];
  crawl_issues: { issue: string; bot?: string }[];
  recipient_emails: string[];
};

type ThresholdAlertCandidate = {
  brand_id: string;
  workspace_id: string;
  brand_name: string;
  competitor_name: string;
  prompt_id: string;
  prompt_text: string;
  checked_at: string;
  recipient_emails: string[];
};

function headers() {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

// Same 204-handling as engine-worker/scoring-worker's rpc() helper --
// record_alert_sent returns a real boolean body, but PostgREST still returns
// 204 for the read-only table functions in some edge cases (empty result
// set), so this stays defensive rather than assuming a body is always present.
async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${name} failed: ${response.status} ${await response.text()}`);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    worker: "alerting-worker",
    ...meta,
  };
  console[level](JSON.stringify(entry));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CRAWL_ISSUE_LABELS: Record<string, string> = {
  missing_schema_markup: "Missing schema.org structured data",
  missing_h1: "Missing an H1 heading",
  bot_disallowed: "An AI crawler is disallowed in robots.txt",
};

function renderDigestEmail(c: DigestCandidate): { subject: string; html: string; text: string } {
  const direction = c.score_change > 0 ? "up" : c.score_change < 0 ? "down" : "unchanged";
  const changeText =
    c.score_change === 0 ? "unchanged" : `${direction} ${Math.abs(c.score_change)} points`;

  const mentionLines = [
    ...c.new_mentions.map((m) => `+ New mention: "${m.prompt_text}"`),
    ...c.lost_mentions.map((m) => `- Lost mention: "${m.prompt_text}"`),
  ];
  const crawlLines = c.crawl_issues.map((issue) => {
    const label = CRAWL_ISSUE_LABELS[issue.issue] ?? issue.issue;
    return issue.bot ? `- ${label} (${issue.bot})` : `- ${label}`;
  });

  const text = [
    `Weekly AEO Visibility digest for ${c.brand_name}`,
    ``,
    `Visibility Score: ${c.current_score} (${changeText}${c.prior_score === null ? ", first week with data" : ""})`,
    mentionLines.length
      ? `\nMention changes:\n${mentionLines.join("\n")}`
      : `\nNo mention changes this week.`,
    crawlLines.length ? `\nNew crawl issues:\n${crawlLines.join("\n")}` : `\nNo new crawl issues.`,
  ].join("\n");

  const html = `
    <h2>Weekly AEO Visibility digest for ${escapeHtml(c.brand_name)}</h2>
    <p><strong>Visibility Score:</strong> ${c.current_score} (${escapeHtml(changeText)}${c.prior_score === null ? ", first week with data" : ""})</p>
    ${mentionLines.length ? `<p><strong>Mention changes:</strong></p><ul>${mentionLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : "<p>No mention changes this week.</p>"}
    ${crawlLines.length ? `<p><strong>New crawl issues:</strong></p><ul>${crawlLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : "<p>No new crawl issues.</p>"}
  `.trim();

  return { subject: `Your weekly AEO Visibility digest: ${c.brand_name}`, html, text };
}

function renderThresholdAlertEmail(c: ThresholdAlertCandidate): {
  subject: string;
  html: string;
  text: string;
} {
  const text = [
    `${c.competitor_name} was just cited by an AI engine on a prompt where ${c.brand_name} wasn't mentioned.`,
    ``,
    `Prompt: "${c.prompt_text}"`,
    `Checked: ${c.checked_at}`,
  ].join("\n");

  const html = `
    <h2>New competitor citation: ${escapeHtml(c.competitor_name)}</h2>
    <p><strong>${escapeHtml(c.competitor_name)}</strong> was just cited by an AI engine on a prompt where <strong>${escapeHtml(c.brand_name)}</strong> wasn't mentioned.</p>
    <p><strong>Prompt:</strong> "${escapeHtml(c.prompt_text)}"</p>
    <p><strong>Checked:</strong> ${escapeHtml(c.checked_at)}</p>
  `.trim();

  return { subject: `${c.competitor_name} newly cited where ${c.brand_name} wasn't`, html, text };
}

async function sendEmail(
  to: string[],
  subject: string,
  html: string,
  text: string,
): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    log("error", "Resend send failed", { status: response.status, body: await response.text() });
    return false;
  }
  return true;
}

async function processDigests(
  periodStart: string,
  periodEnd: string,
  priorPeriodStart: string,
  priorPeriodEnd: string,
) {
  const candidates = await rpc<DigestCandidate[]>("get_weekly_digest_candidates", {
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_prior_period_start: priorPeriodStart,
    p_prior_period_end: priorPeriodEnd,
  });

  let sent = 0;
  let skippedNoRecipients = 0;
  let skippedNoResendKey = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (candidate.recipient_emails.length === 0) {
      skippedNoRecipients += 1;
      continue;
    }
    if (!RESEND_API_KEY) {
      skippedNoResendKey += 1;
      continue;
    }
    const { subject, html, text } = renderDigestEmail(candidate);
    const ok = await sendEmail(candidate.recipient_emails, subject, html, text);
    if (!ok) {
      failed += 1;
      log("error", "Weekly digest send failed", { brandId: candidate.brand_id });
      continue;
    }
    await rpc("record_alert_sent", {
      p_brand_id: candidate.brand_id,
      p_type: "weekly_digest",
      p_dedupe_key: periodStart,
      p_payload: candidate,
      p_recipient_count: candidate.recipient_emails.length,
    });
    sent += 1;
  }

  if (skippedNoResendKey > 0) {
    log("warn", "RESEND_API_KEY not configured -- skipped sending weekly digests", {
      skipped: skippedNoResendKey,
    });
  }

  return { candidates: candidates.length, sent, skippedNoRecipients, skippedNoResendKey, failed };
}

async function processThresholdAlerts() {
  const candidates = await rpc<ThresholdAlertCandidate[]>("get_new_threshold_alerts", {
    p_limit: 50,
  });

  let sent = 0;
  let skippedNoRecipients = 0;
  let skippedNoResendKey = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (candidate.recipient_emails.length === 0) {
      skippedNoRecipients += 1;
      continue;
    }
    if (!RESEND_API_KEY) {
      skippedNoResendKey += 1;
      continue;
    }
    const { subject, html, text } = renderThresholdAlertEmail(candidate);
    const ok = await sendEmail(candidate.recipient_emails, subject, html, text);
    if (!ok) {
      failed += 1;
      log("error", "Threshold alert send failed", {
        brandId: candidate.brand_id,
        competitor: candidate.competitor_name,
      });
      continue;
    }
    await rpc("record_alert_sent", {
      p_brand_id: candidate.brand_id,
      p_type: "threshold_alert",
      p_dedupe_key: candidate.competitor_name,
      p_payload: candidate,
      p_recipient_count: candidate.recipient_emails.length,
    });
    sent += 1;
  }

  if (skippedNoResendKey > 0) {
    log("warn", "RESEND_API_KEY not configured -- skipped sending threshold alerts", {
      skipped: skippedNoResendKey,
    });
  }

  return { candidates: candidates.length, sent, skippedNoRecipients, skippedNoResendKey, failed };
}

// Same constant-time comparison as every other worker's secret check
// (engine-worker/extraction-worker/scoring-worker) -- see those files for
// the full reasoning; kept identical here for consistency.
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  if (bytesA.length !== bytesB.length) {
    let dummy = 0;
    for (let i = 0; i < bytesA.length; i++) dummy |= bytesA[i] ^ 0;
    void dummy;
    return false;
  }
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (request) => {
  const providedSecret = request.headers.get("x-alerting-worker-secret") ?? "";
  if (
    request.method !== "POST" ||
    !WORKER_SECRET ||
    !timingSafeEqual(providedSecret, WORKER_SECRET)
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  log("info", "Worker invocation started", {
    requestId,
    resendConfigured: Boolean(RESEND_API_KEY),
  });

  try {
    const now = new Date();
    const periodEnd = isoDate(now);
    const periodStart = isoDate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    const priorPeriodEnd = isoDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
    const priorPeriodStart = isoDate(new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000));

    const digestResult = await processDigests(
      periodStart,
      periodEnd,
      priorPeriodStart,
      priorPeriodEnd,
    );
    const thresholdResult = await processThresholdAlerts();

    const durationMs = Date.now() - startTime;
    log("info", "Worker invocation completed", {
      requestId,
      durationMs,
      digest: digestResult,
      thresholdAlert: thresholdResult,
    });

    return Response.json({ digest: digestResult, thresholdAlert: thresholdResult });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log("error", "Worker invocation failed", {
      requestId,
      durationMs,
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "worker failure" }, { status: 500 });
  }
});
