// Module 5.1 — Auth & Account
// See progress/modules/5.1-auth-and-account.md for acceptance criteria,
// decisions log, and caching/security notes.
export { normalizeEmail } from "./email";
export { canInviteRole, isAtLeast, type WorkspaceRole } from "./permissions";
export { signUpSchema, signInSchema, type SignUpInput, type SignInInput } from "./schemas";
export { createWorkspace, type CreateWorkspaceResult } from "./workspace";
