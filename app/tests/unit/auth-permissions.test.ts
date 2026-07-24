import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canInviteRole, isAtLeast } from "../../src/modules/auth/permissions.ts";

describe("canInviteRole", () => {
  it("owner can invite any role", () => {
    assert.equal(canInviteRole("owner", "owner"), true);
    assert.equal(canInviteRole("owner", "member"), true);
    assert.equal(canInviteRole("owner", "viewer"), true);
  });

  it("member can only invite viewer", () => {
    assert.equal(canInviteRole("member", "viewer"), true);
    assert.equal(canInviteRole("member", "member"), false);
    assert.equal(canInviteRole("member", "owner"), false);
  });

  it("viewer cannot invite anyone", () => {
    assert.equal(canInviteRole("viewer", "viewer"), false);
    assert.equal(canInviteRole("viewer", "member"), false);
    assert.equal(canInviteRole("viewer", "owner"), false);
  });
});

describe("isAtLeast", () => {
  it("ranks owner above member above viewer", () => {
    assert.equal(isAtLeast("owner", "member"), true);
    assert.equal(isAtLeast("member", "owner"), false);
    assert.equal(isAtLeast("viewer", "viewer"), true);
    assert.equal(isAtLeast("owner", "viewer"), true);
  });
});
