import test from "node:test";
import assert from "node:assert/strict";
import { parseTopicPlanJson } from "../src/services/topicPlanGenerator";

test("parseTopicPlanJson parses valid array", () => {
  const raw = JSON.stringify([
    { day_no: 1, topic: "A", key_notes: "KA" },
    { day_no: 2, topic: "B", key_notes: "KB" },
  ]);
  const rows = parseTopicPlanJson(raw, 2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].day_no, 1);
  assert.equal(rows[1].topic, "B");
});

test("parseTopicPlanJson rejects wrong total length", () => {
  const raw = JSON.stringify([{ day_no: 1, topic: "A", key_notes: "KA" }]);
  assert.throws(() => parseTopicPlanJson(raw, 2), /exactly 2 items/);
});

test("parseTopicPlanJson rejects duplicate day_no", () => {
  const raw = JSON.stringify([
    { day_no: 1, topic: "A", key_notes: "KA" },
    { day_no: 1, topic: "B", key_notes: "KB" },
  ]);
  assert.throws(() => parseTopicPlanJson(raw, 2), /Duplicate day_no/);
});
