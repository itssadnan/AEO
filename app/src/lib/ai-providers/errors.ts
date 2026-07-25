/**
 * Shared AI provider error class used by both server and test code.
 * Does NOT import "server-only" so it can be used in Node.js test runner.
 */
export type AiProviderErrorCode =
  | "rate_limited"
  | "unauthorized"
  | "provider_unavailable"
  | "timeout"
  | "malformed_response"
  | "not_configured";

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly retryAfterSeconds: number;

  constructor(code: AiProviderErrorCode, retryAfterSeconds = 60) {
    super(code);
    this.name = "AiProviderError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
