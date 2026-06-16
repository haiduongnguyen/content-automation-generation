import test from "node:test";
import assert from "node:assert/strict";
import { isAtOrAfterSchedule, parseScheduleTime, secondsToMs } from "../src/services/serverScheduler";

test("parseScheduleTime parses HH:mm", () => {
  assert.deepEqual(parseScheduleTime("21:05"), { hour: 21, minute: 5 });
});

test("parseScheduleTime rejects invalid time", () => {
  assert.throws(() => parseScheduleTime("25:00"), /Invalid schedule time/);
  assert.throws(() => parseScheduleTime("9"), /Invalid schedule time/);
});

test("isAtOrAfterSchedule compares local clock minutes", () => {
  assert.equal(isAtOrAfterSchedule(new Date("2026-06-16T21:00:00+07:00"), "21:00"), true);
  assert.equal(isAtOrAfterSchedule(new Date("2026-06-16T20:59:00+07:00"), "21:00"), false);
});

test("secondsToMs clamps to at least one second", () => {
  assert.equal(secondsToMs(0), 1000);
  assert.equal(secondsToMs(5), 5000);
});
