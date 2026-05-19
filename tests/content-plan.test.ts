import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlanDayNo } from "../src/services/contentPlan";

test("resolvePlanDayNo maps day 1 to 1", () => {
  const d = new Date("2026-05-01T10:00:00+07:00");
  assert.equal(resolvePlanDayNo(d), 1);
});

test("resolvePlanDayNo maps day 30 to 30", () => {
  const d = new Date("2026-05-30T10:00:00+07:00");
  assert.equal(resolvePlanDayNo(d), 30);
});

test("resolvePlanDayNo wraps day 31 to 1", () => {
  const d = new Date("2026-05-31T10:00:00+07:00");
  assert.equal(resolvePlanDayNo(d), 1);
});
