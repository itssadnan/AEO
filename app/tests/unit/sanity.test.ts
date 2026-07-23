import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Smoke test proving the test harness (Node's built-in test runner + native TS
// type-stripping, strict tsconfig) is wired up correctly. Module 0.0 (Project Setup)
// owns this file; each business module adds its own unit/integration tests here as
// it's implemented (see docs/CONVENTIONS.md, Definition of Done).
describe("test harness", () => {
  it("runs TypeScript tests under strict mode", () => {
    const add = (a: number, b: number): number => a + b;
    assert.strictEqual(add(2, 3), 5);
  });
});
