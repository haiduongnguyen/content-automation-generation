import assert from "node:assert/strict";
import test from "node:test";
import { formatRows, getArgValue, getRequiredArg, parsePositiveInt } from "../src/scripts/cliArgs";
import { enumerateDateRange, parseDateOnly } from "../src/services/operations/backfill";

test("cli arg helpers read required and optional args", () => {
  const args = ["--id", "42", "--limit", "10"];
  assert.equal(getArgValue("--id", args), "42");
  assert.equal(getArgValue("--missing", args), null);
  assert.equal(getRequiredArg("--limit", args), "10");
  assert.throws(() => getRequiredArg("--missing", args), /Missing required argument/);
});

test("parsePositiveInt rejects invalid values", () => {
  assert.equal(parsePositiveInt("3", "limit"), 3);
  assert.throws(() => parsePositiveInt("0", "limit"), /Invalid limit/);
  assert.throws(() => parsePositiveInt("x", "limit"), /Invalid limit/);
});

test("formatRows renders an empty table marker", () => {
  assert.equal(formatRows([], ["id"]), "(no rows)");
});

test("parseDateOnly validates YYYY-MM-DD", () => {
  assert.equal(parseDateOnly("2026-06-16"), "2026-06-16");
  assert.throws(() => parseDateOnly("2026-02-30"), /Invalid date/);
  assert.throws(() => parseDateOnly("16-06-2026"), /Invalid date/);
});

test("enumerateDateRange returns inclusive dates and enforces max range", () => {
  assert.deepEqual(enumerateDateRange("2026-06-16", "2026-06-18"), [
    "2026-06-16",
    "2026-06-17",
    "2026-06-18",
  ]);
  assert.throws(() => enumerateDateRange("2026-06-18", "2026-06-16"), /before or equal/);
  assert.throws(() => enumerateDateRange("2026-06-01", "2026-06-05", 3), /too large/);
});
