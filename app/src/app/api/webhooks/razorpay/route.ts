import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/db";
import type { Json } from "@/types/database";
import {
  verifyRazorpayWebhookSignature,
  razorpayWebhookPayloadSchema,
  subscriptionNotesSchema,
} from "@/modules/billing";

/**
 * Razorpay webhook listener — the only writer of `subscriptions.status` and
 * `workspaces.plan_tier` after initial checkout (Module 5.9). Runs with the
 * service-role client: Razorpay's call carries no Supabase session, and the
 * DB functions this route calls (`record_webhook_event`,
 * `update_subscription_from_webhook`) are locked to `service_role` only
 * (migration 0023's `revoke ... grant ... to service_role`).
 *
 * Security (docs/CONVENTIONS.md Section 6 + this module's own security
 * note): every request is rejected unless its HMAC-SHA256 signature over
 * the *raw* body matches, verified before the body is parsed as JSON or
 * trusted in any way. `request.text()` is read exactly once, before any
 * parsing, specifically so the signature is computed over the same bytes
 * Razorpay signed -- re-serializing a parsed JSON object would not
 * necessarily byte-for-byte match what was signed.
 *
 * Idempotency: Razorpay documents at-least-once delivery
 * (https://razorpay.com/docs/webhooks/validate-test/#idempotency), so a
 * duplicate delivery of the same event_id is expected, not an error --
 * record_webhook_event returns false for a repeat and this route
 * short-circuits with 200 without re-applying the state change.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-razorpay-signature");
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // Not configured yet -- see this module's tracker Blockers. Reject
    // rather than silently accepting unverifiable webhooks.
    console.error("razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  if (!verifyRazorpayWebhookSignature(rawBody, signatureHeader, webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = razorpayWebhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    console.error("razorpay webhook payload failed schema validation", parsed.error.message);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const payload = parsed.data;
  const supabase = createSupabaseServiceRoleClient();

  // Razorpay uses the event id in the payload envelope for at-least-once
  // dedupe (not a separate header) -- `${event}:${subscription.id}:${created_at}`
  // would also work, but Razorpay's own docs point at re-delivery being keyed
  // by the subscription entity + event, so use the subscription id + event +
  // created_at combination as a stable idempotency key since Razorpay's
  // webhook body itself has no single dedicated `event_id` field on this
  // payload shape (unlike e.g. Stripe) -- it's synthesized here instead.
  const subscriptionEntity = payload.payload.subscription?.entity;
  if (!subscriptionEntity) {
    // Some Razorpay events (e.g. payment.* ) don't carry a subscription
    // entity at all. This route only cares about subscription lifecycle
    // events, so anything else is acknowledged and ignored, not an error.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const eventId = `${payload.event}:${subscriptionEntity.id}:${payload.created_at}`;

  const { data: isNewEvent, error: recordError } = await supabase.rpc("record_webhook_event", {
    p_event_id: eventId,
    p_event_type: payload.event,
    p_payload: json as Json,
  });

  if (recordError) {
    console.error("razorpay webhook record_webhook_event failed", recordError.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  if (!isNewEvent) {
    // Duplicate delivery -- already processed, nothing more to do.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const notesResult = subscriptionNotesSchema.safeParse(subscriptionEntity.notes);
  if (!notesResult.success) {
    // This should only happen for a subscription this module didn't create
    // itself (e.g. one made directly in the Razorpay dashboard without the
    // notes this module always attaches at creation, see razorpay-client.ts).
    // Logged and acknowledged rather than retried forever, since there is no
    // workspace to resolve to.
    console.error(
      "razorpay webhook subscription missing expected notes (workspace_id/plan_tier)",
      subscriptionEntity.id,
    );
    return NextResponse.json({ ok: true, skipped: "missing_notes" });
  }

  const { workspace_id, plan_tier } = notesResult.data;
  const currentPeriodEnd = subscriptionEntity.current_end
    ? new Date(subscriptionEntity.current_end * 1000).toISOString()
    : null;

  const { error: updateError } = await supabase.rpc("update_subscription_from_webhook", {
    p_razorpay_subscription_id: subscriptionEntity.id,
    p_workspace_id: workspace_id,
    p_razorpay_plan_id: subscriptionEntity.plan_id,
    p_plan_tier: plan_tier,
    p_status: subscriptionEntity.status,
    // The generated RPC arg type is `string` (not `string | null`) because
    // Supabase's type generator doesn't mark nullable function parameters
    // as optional -- the underlying SQL parameter is a nullable timestamptz
    // (migration 0023) and Postgres accepts a real null here without issue.
    p_current_period_end: currentPeriodEnd as string,
  });

  if (updateError) {
    console.error("razorpay webhook update_subscription_from_webhook failed", updateError.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
