/**
 * Normalizes an email for the Free-plan-per-person dedup rule (Module 5.1
 * acceptance criteria). Mirrors the SQL function public.normalize_email() in
 * supabase/migrations/0001_auth_and_workspaces.sql — keep both in sync if
 * either changes. The SQL copy is the actual source of truth (it's what the
 * unique index and create_workspace() enforce against); this one exists so
 * the UI/API layer can show a same-email error before round-tripping to
 * Postgres.
 */
export function normalizeEmail(rawEmail: string): string {
  const email = rawEmail.trim().toLowerCase();
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return email;

  let localPart = email.slice(0, atIndex);
  let domainPart = email.slice(atIndex + 1);

  const plusIndex = localPart.indexOf("+");
  if (plusIndex !== -1) {
    localPart = localPart.slice(0, plusIndex);
  }

  if (domainPart === "gmail.com" || domainPart === "googlemail.com") {
    localPart = localPart.replace(/\./g, "");
    domainPart = "gmail.com";
  }

  return `${localPart}@${domainPart}`;
}
