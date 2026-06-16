import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkerId, getTodayRunDate, isRetryablePipelineJob, serializeJobPayload } from "../src/services/pipelineJobs";

test("serializeJobPayload serializes empty payloads as empty object JSON", () => {
  assert.equal(serializeJobPayload(undefined), "{}");
  assert.equal(serializeJobPayload(null), "{}");
});

test("serializeJobPayload serializes object payload", () => {
  assert.equal(serializeJobPayload({ source: "test" }), "{\"source\":\"test\"}");
});

test("getTodayRunDate returns Vietnam date string", () => {
  const d = new Date("2026-06-16T01:30:00+07:00");
  assert.equal(getTodayRunDate(d), "2026-06-16");
});

test("buildWorkerId includes prefix and process id", () => {
  const id = buildWorkerId("unit");
  assert.match(id, /^unit:.+:\d+$/);
});

test("isRetryablePipelineJob allows failed jobs with attempts remaining", () => {
  assert.equal(
    isRetryablePipelineJob({ status: "failed", attempt_count: 1, max_attempts: 3 }),
    true
  );
});

test("isRetryablePipelineJob blocks exhausted or non-failed jobs", () => {
  assert.equal(
    isRetryablePipelineJob({ status: "failed", attempt_count: 3, max_attempts: 3 }),
    false
  );
  assert.equal(
    isRetryablePipelineJob({ status: "queued", attempt_count: 1, max_attempts: 3 }),
    false
  );
});
