import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyPipelineEvent, getDailyPipelineSteps } from "../src/services/dailyPipeline";

test("getDailyPipelineSteps includes generate and publish by default", () => {
  assert.deepEqual(getDailyPipelineSteps({ reportEmailEnabled: false }), ["generate", "publish"]);
});

test("getDailyPipelineSteps includes report when report email is enabled", () => {
  assert.deepEqual(getDailyPipelineSteps({ reportEmailEnabled: true }), ["generate", "publish", "report"]);
});

test("buildDailyPipelineEvent creates stable event type and payload", () => {
  const event = buildDailyPipelineEvent({
    step: "publish",
    status: "skipped",
    message: "PUBLISH_ENABLED is false",
    payload: { postId: "58" },
  });
  assert.deepEqual(event, {
    eventType: "publish_skipped",
    message: "PUBLISH_ENABLED is false",
    payload: { postId: "58" },
  });
});
