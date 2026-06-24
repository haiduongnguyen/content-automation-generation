import assert from "node:assert/strict";
import test from "node:test";
import {
  enumerateQuarterSlots,
  getQuarterKeysToEnsure,
  getQuarterRange,
  parseQuarterlyTopicJson,
} from "../src/services/quarterlyTopicPlan";

const slots = ["morning_09", "evening_21"];

test("quarter slot enumeration handles 90, 91, and 92 day quarters", () => {
  assert.equal(enumerateQuarterSlots(getQuarterRange("2026-Q1"), slots).length, 90 * 2);
  assert.equal(enumerateQuarterSlots(getQuarterRange("2026-Q2"), slots).length, 91 * 2);
  assert.equal(enumerateQuarterSlots(getQuarterRange("2026-Q3"), slots).length, 92 * 2);
});

test("quarter slot enumeration can backfill only remaining dates", () => {
  const rows = enumerateQuarterSlots(getQuarterRange("2026-Q2"), slots, "2026-06-21");
  assert.equal(rows[0]?.planDate, "2026-06-21");
  assert.equal(rows[rows.length - 1]?.planDate, "2026-06-30");
  assert.equal(rows.length, 10 * 2);
});

test("quarter scheduler includes next quarter inside lead window", () => {
  assert.deepEqual(getQuarterKeysToEnsure("2026-06-16", 15), ["2026-Q2", "2026-Q3"]);
  assert.deepEqual(getQuarterKeysToEnsure("2026-06-15", 15), ["2026-Q2"]);
});

test("quarterly topic parser requires every date and slot exactly once", () => {
  const expected = [
    { planDate: "2026-07-01", scheduledSlot: "morning_09" },
    { planDate: "2026-07-01", scheduledSlot: "evening_21" },
  ];
  const rows = parseQuarterlyTopicJson(
    JSON.stringify([
      {
        plan_date: "2026-07-01",
        scheduled_slot: "morning_09",
        pillar_name: "ai_intuition",
        topic: "Topic A",
        key_notes: "Notes A",
      },
      {
        plan_date: "2026-07-01",
        scheduled_slot: "evening_21",
        pillar_name: "ml_algorithms",
        topic: "Topic B",
        key_notes: "Notes B",
      },
    ]),
    expected
  );
  assert.equal(rows.length, 2);
  assert.throws(
    () => parseQuarterlyTopicJson(JSON.stringify([rows[0], rows[0]]), expected),
    /Invalid or duplicate/
  );
});
