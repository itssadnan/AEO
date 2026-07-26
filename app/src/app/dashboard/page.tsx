import { redirect } from "next/navigation";

/**
 * Legacy placeholder from Module 5.1, kept only as a redirect for any
 * existing bookmarks/links to /dashboard. The real dashboard UI (Module 5.6)
 * lives at /overview (and the sibling /prompts, /competitors, /reports,
 * /settings routes) via the (dashboard) route group.
 *
 * Found during independent verification: every real entry point in the app
 * (sign-in, sign-up, brand creation, the auth callback's default `next`)
 * used to redirect here, to this dead "Welcome, {email}" placeholder instead
 * of the actual built dashboard -- meaning the Module 5.6 UI was effectively
 * unreachable through normal product flow despite being fully built and
 * verified. Fixed by pointing all of those redirects at /overview directly
 * and turning this route into a plain redirect for anyone who still lands
 * here (e.g. an old bookmark).
 */
export default function DashboardPlaceholderRedirect() {
  redirect("/overview");
}
