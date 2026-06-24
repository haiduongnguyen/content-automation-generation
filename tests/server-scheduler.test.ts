import test from "node:test";
import assert from "node:assert/strict";
import { buildScheduleSlot, isAtOrAfterSchedule, parseScheduleTime, parseScheduleTimes, secondsToMs } from "../src/services/serverScheduler";
import { shouldDispatchSchedule } from "../src/scripts/schedulerLoop";

test("parseScheduleTime parses HH:mm", () => {
  assert.deepEqual(parseScheduleTime("21:05"), { hour: 21, minute: 5 });
});

test("parseScheduleTime rejects invalid time", () => {
  assert.throws(() => parseScheduleTime("25:00"), /Invalid schedule time/);
  assert.throws(() => parseScheduleTime("9"), /Invalid schedule time/);
});

test("parseScheduleTimes creates stable slots for two daily posts", () => {
  assert.deepEqual(parseScheduleTimes("09:00,21:00"), [
    { time: "09:00", slot: "morning_09" },
    { time: "21:00", slot: "evening_21" },
  ]);
  assert.equal(buildScheduleSlot("21:30"), "evening_2130");
});

test("isAtOrAfterSchedule compares local clock minutes", () => {
  assert.equal(isAtOrAfterSchedule(new Date("2026-06-16T21:00:00+07:00"), "21:00"), true);
  assert.equal(isAtOrAfterSchedule(new Date("2026-06-16T20:59:00+07:00"), "21:00"), false);
});

test("secondsToMs clamps to at least one second", () => {
  assert.equal(secondsToMs(0), 1000);
  assert.equal(secondsToMs(5), 5000);
});

test("scheduler dispatches each date and slot only once per process", () => {
  const dispatched = new Set<string>();
  assert.equal(shouldDispatchSchedule(dispatched, "2026-06-21", "morning_09", true), true);
  dispatched.add("2026-06-21:morning_09");
  assert.equal(shouldDispatchSchedule(dispatched, "2026-06-21", "morning_09", true), false);
  assert.equal(shouldDispatchSchedule(dispatched, "2026-06-21", "evening_21", false), false);
  assert.equal(shouldDispatchSchedule(dispatched, "2026-06-22", "morning_09", true), true);
});
