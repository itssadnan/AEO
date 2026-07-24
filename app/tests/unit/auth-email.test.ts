import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail } from "../../src/modules/auth/email.ts";

describe("normalizeEmail", () => {
  it("lowercases the email", () => {
    assert.equal(normalizeEmail("Foo@Example.com"), "foo@example.com");
  });

  it("strips +tag suffixes", () => {
    assert.equal(normalizeEmail("foo+bar@example.com"), "foo@example.com");
  });

  it("strips dots for gmail addresses", () => {
    assert.equal(normalizeEmail("f.o.o@gmail.com"), "foo@gmail.com");
  });

  it("treats googlemail.com as gmail.com and applies the same rules", () => {
    assert.equal(normalizeEmail("f.o.o+x@googlemail.com"), "foo@gmail.com");
  });

  it("does not strip dots for non-gmail domains", () => {
    assert.equal(normalizeEmail("f.o.o@example.com"), "f.o.o@example.com");
  });

  it("combines +tag and dot stripping together for gmail", () => {
    assert.equal(normalizeEmail("F.o.o+newsletter@Gmail.com"), "foo@gmail.com");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(normalizeEmail("  foo@example.com  "), "foo@example.com");
  });
});
