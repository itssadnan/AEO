export type ProviderName = "gemini" | "nvidia_nim";
export type KeySlot = "primary" | "secondary" | "tertiary";
export type FailoverMode = "shared" | "emergency-only";

export interface KeyHealthRow {
  provider: ProviderName;
  keySlot: KeySlot;
  isDead: boolean;
  deadAt: string | null;
  lastErrorCode: string | null;
}

export interface ProviderQuotaSnapshot {
  provider: ProviderName;
  // Per-key counts where key_slot is known (post-migration-0019 rows only
  // -- historical rows before this migration will show as an "unknown"
  // bucket, see below). Do not backfill key_slot for historical rows --
  // there is no way to know it after the fact.
  byKeySlot: Record<KeySlot | "unknown", { last1h: number; last24h: number }>;
  // Reference-only, not enforced anywhere -- see the comment on
  // KNOWN_FREE_TIER_CAPS below for why these are approximate.
  informationalCapNote: string;
}

export interface ErrorLogEntry {
  id: number;
  provider: string;
  keySlot: KeySlot | null;
  jobId: string | null;
  errorCode: string;
  retryable: boolean;
  createdAt: string;
}

export interface ChurnCustomer {
  workspaceId: string;
  workspaceName: string;
  planTier: string;
  lastSignInAt: string | null; // from auth.users, null if never signed in
  daysSinceLastSignIn: number | null;
}

// Reuses billing's PlanTierId rather than redefining the same union here --
// modules/billing/plans.ts is the single source of truth for valid plan
// tiers (see that file's header comment).
import type { PlanTierId } from "@/modules/billing";

export interface WorkspaceOverrideRow {
  id: string;
  name: string;
  planTier: PlanTierId;
  ownerEmail: string | null;
}

export interface AiTaskConfigRow {
  id: string;
  taskKey: string;
  workspaceId: string | null; // null = global default
  workspaceName: string | null; // joined in for override rows, null for global
  provider: ProviderName;
  model: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null; // auth.users id -- resolve to email in the UI layer, not stored denormalized
}
