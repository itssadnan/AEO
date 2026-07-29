import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { withKeyFailover, resetKeyPoolForTests, type KeySlot } from "../../src/lib/ai-providers/key-pool.ts";

describe("withKeyFailover onAttempt callback", () => {
  beforeEach(() => {
    resetKeyPoolForTests();
    process.env.GEMINI_API_KEY_PRIMARY = "primary-key";
    process.env.GEMINI_API_KEY_SECONDARY = "secondary-key";
    process.env.GEMINI_API_KEY_TERTIARY = "tertiary-key";
  });

  it("calls onAttempt once for the primary slot when primary succeeds on first try", async () => {
    const attempts: KeySlot[] = [];
    const result = await withKeyFailover({
      provider: "gemini",
      mode: "shared",
      onAttempt: (slot) => attempts.push(slot),
      run: async (_key, slot) => `success-${slot}`,
    });

    assert.equal(result, "success-primary");
    assert.deepEqual(attempts, ["primary"]);
  });

  it("calls onAttempt for primary then secondary when primary rate-limits in shared mode", async () => {
    const attempts: KeySlot[] = [];
    let runCalls = 0;

    const result = await withKeyFailover({
      provider: "gemini",
      mode: "shared",
      onAttempt: (slot) => attempts.push(slot),
      run: async (_key, slot) => {
        runCalls++;
        if (slot === "primary") {
          const { AiProviderError } = await import("../../src/lib/ai-providers/key-pool.ts");
          throw new AiProviderError("rate_limited");
        }
        return `success-${slot}`;
      },
    });

    assert.equal(result, "success-secondary");
    assert.equal(runCalls, 2);
    assert.deepEqual(attempts, ["primary", "secondary"]);
  });

  it("calls onAttempt for all candidate slots when all fail", async () => {
    const attempts: KeySlot[] = [];

    await assert.rejects(
      () =>
        withKeyFailover({
          provider: "gemini",
          mode: "shared",
          onAttempt: (slot) => attempts.push(slot),
          run: async () => {
            const { AiProviderError } = await import("../../src/lib/ai-providers/key-pool.ts");
            throw new AiProviderError("provider_unavailable");
          },
        }),
      (error: unknown) => (error as { code?: string })?.code === "provider_unavailable",
    );

    assert.deepEqual(attempts, ["primary", "secondary", "tertiary"]);
  });
});
