export type WorkspaceRole = "owner" | "member" | "viewer";

const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 0, member: 1, owner: 2 };

/**
 * Invite-permission matrix (see progress/modules/5.1-auth-and-account.md
 * decisions log): Owner can invite/promote to any role. Member can invite
 * Viewers only. Viewer cannot invite anyone.
 *
 * This is the single source of truth the UI uses to decide what to show —
 * the real gate is the workspace_members_insert_by_role RLS policy in
 * supabase/migrations/0001_auth_and_workspaces.sql, which enforces the same
 * rule at the database layer regardless of what the UI allows.
 */
export function canInviteRole(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  if (actorRole === "owner") return true;
  if (actorRole === "member") return targetRole === "viewer";
  return false;
}

export function isAtLeast(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
