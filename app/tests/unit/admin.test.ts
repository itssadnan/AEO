import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isNearCap } from "../../src/modules/admin/quota-caps.ts";
import { requireAdmin } from "../../src/lib/security/admin.ts";

describe("Admin Console Security & Logic", () => {
  const originalEnv = process.env.ADMIN_USER_EMAILS;

  beforeEach(() => {
    process.env.ADMIN_USER_EMAILS = "admin@example.com, founder+test@aeo.io";
  });

  afterEach(() => {
    process.env.ADMIN_USER_EMAILS = originalEnv;
  });

  describe("requireAdmin", () => {
    it("returns null for an authorized admin user", async () => {
      const mockSupabase = {
        auth: {
          getUser: async () => ({ data: { user: { email: "admin@example.com" } } }),
        },
      };

      const result = await requireAdmin(mockSupabase);
      assert.equal(result, null);
    });

    it("normalizes casing and whitespace matching allowlist entries", async () => {
      const mockSupabase = {
        auth: {
          getUser: async () => ({ data: { user: { email: "  ADMIN@EXAMPLE.COM  " } } }),
        },
      };

      const result = await requireAdmin(mockSupabase);
      assert.equal(result, null);
    });

    it("rejects signed-in users not in the allowlist", async () => {
      const mockSupabase = {
        auth: {
          getUser: async () => ({ data: { user: { email: "stranger@example.com" } } }),
        },
      };

      const result = await requireAdmin(mockSupabase);
      assert.deepEqual(result, { error: "Not authorized." });
    });

    it("rejects unauthenticated requests", async () => {
      const mockSupabase = {
        auth: {
          getUser: async () => ({ data: { user: null } }),
        },
      };

      const result = await requireAdmin(mockSupabase);
      assert.deepEqual(result, { error: "You must be signed in." });
    });
  });

  describe("isNearCap", () => {
    it("returns true when count is at or above 80% of cap", () => {
      assert.equal(isNearCap(80, 100), true);
      assert.equal(isNearCap(85, 100), true);
      assert.equal(isNearCap(12, 15), true); // 12/15 = 0.8
    });

    it("returns false when count is below 80% of cap", () => {
      assert.equal(isNearCap(79, 100), false);
      assert.equal(isNearCap(11, 15), false);
      assert.equal(isNearCap(0, 100), false);
    });

    it("returns false when cap is null or undefined", () => {
      assert.equal(isNearCap(500, null), false);
    });
  });
});
