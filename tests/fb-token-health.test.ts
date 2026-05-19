import test from "node:test";
import assert from "node:assert/strict";
import { computeTokenHealth } from "../src/services/fbTokenHealth";

test("computeTokenHealth returns invalid shape when token invalid", () => {
  const h = computeTokenHealth(false, null, 0);
  assert.equal(h.isValid, false);
  assert.equal(h.daysLeft, null);
});

test("computeTokenHealth returns null expiry when expires_at is 0", () => {
  const h = computeTokenHealth(true, 0, 0);
  assert.equal(h.isValid, true);
  assert.equal(h.expiresAtIso, null);
});

test("computeTokenHealth computes days left", () => {
  const now = Date.parse("2026-05-10T00:00:00.000Z");
  const expires = Math.floor((now + 3 * 86400 * 1000) / 1000);
  const h = computeTokenHealth(true, expires, now);
  assert.equal(h.daysLeft, 3);
});

