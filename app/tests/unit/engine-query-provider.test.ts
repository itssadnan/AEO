import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { runGeminiGroundedPrompt } from "../../src/lib/ai-providers/gemini-provider.ts";
import { resetKeyPoolForTests } from "../../src/lib/ai-providers/key-pool.ts";
import { runNvidiaNimPrompt } from "../../src/lib/ai-providers/nvidia-nim-provider.ts";

describe("Gemini grounded provider", () => {
  beforeEach(() => {
    resetKeyPoolForTests();
    process.env.GEMINI_API_KEY_PRIMARY = "primary";
    process.env.GEMINI_API_KEY_SECONDARY = "secondary";
    process.env.GEMINI_API_KEY_TERTIARY = "";
  });
  it("returns validated text and citations from grounding metadata", async () => {
    const result = await runGeminiGroundedPrompt({
      prompt: "best CRM",
      model: "gemini-2.5-flash-lite",
      failoverMode: "shared",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "A grounded answer" }] },
                groundingMetadata: {
                  groundingChunks: [{ web: { uri: "https://example.com", title: "Example" } }],
                },
              },
            ],
          }),
        ),
    });
    assert.equal(result.text, "A grounded answer");
    assert.deepEqual(result.citations, [{ uri: "https://example.com", title: "Example" }]);
  });
  it("uses the secondary key after a shared-mode 429", async () => {
    let calls = 0;
    const result = await runGeminiGroundedPrompt({
      prompt: "x",
      model: "m",
      failoverMode: "shared",
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? new Response("", { status: 429 })
          : new Response(
              JSON.stringify({
                candidates: [{ content: { parts: [{ text: "ok" }] }, groundingMetadata: {} }],
              }),
            );
      },
    });
    assert.equal(result.text, "ok");
    assert.equal(calls, 2);
  });
  it("does not use a secondary key for a plain 429 in emergency-only mode", async () => {
    await assert.rejects(
      () =>
        runGeminiGroundedPrompt({
          prompt: "x",
          model: "m",
          failoverMode: "emergency-only",
          fetchImpl: async () => new Response("", { status: 429 }),
        }),
      (error: unknown) => (error as { code?: string })?.code === "rate_limited",
    );
  });

  it("marks a rejected NVIDIA key dead and uses the next key", async () => {
    process.env.NVIDIA_NIM_API_KEY_PRIMARY = "primary";
    process.env.NVIDIA_NIM_API_KEY_SECONDARY = "secondary";
    const deadSlots: string[] = [];
    let calls = 0;
    const response = await runNvidiaNimPrompt({
      prompt: "extract",
      model: "meta/llama-3.1-8b-instruct",
      failoverMode: "shared",
      onKeyDead: async (_provider, slot) => {
        deadSlots.push(slot);
      },
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? new Response("", { status: 401 })
          : new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }));
      },
    });
    assert.equal(response, "{}");
    assert.deepEqual(deadSlots, ["primary"]);
  });
});
