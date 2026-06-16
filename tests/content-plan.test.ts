import test from "node:test";
import assert from "node:assert/strict";
import { chooseTopic, resolvePlanDayNo } from "../src/services/contentPlan";

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

test("chooseTopic prefers planned topic and does not require fallback", () => {
  const chosen = chooseTopic({ topicName: "Dao ham trong AI", dayNo: 12 }, null);
  assert.deepEqual(chosen, {
    topicName: "Dao ham trong AI",
    topicId: null,
    plannedDayNo: 12,
  });
});

test("chooseTopic uses fallback when no planned topic exists", () => {
  const chosen = chooseTopic(null, { id: "42", name: "Gradient descent" });
  assert.deepEqual(chosen, {
    topicName: "Gradient descent",
    topicId: 42,
    plannedDayNo: null,
  });
});

test("chooseTopic throws when neither planned nor fallback topic exists", () => {
  assert.throws(() => chooseTopic(null, null), /No planned topic/);
});
