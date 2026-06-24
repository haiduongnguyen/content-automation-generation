import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPipelineEvent,
  getDailyPipelineSteps,
  runPipelineSteps,
  type PipelineContext,
  type PipelineStep,
} from "../src/services/dailyPipeline";

test("getDailyPipelineSteps includes core steps by default", () => {
  assert.deepEqual(getDailyPipelineSteps({ reportEmailEnabled: false }), [
    "plan_topic",
    "generate_text",
    "generate_image",
    "approve_or_wait",
    "publish",
  ]);
});

test("getDailyPipelineSteps includes report when report email is enabled", () => {
  assert.deepEqual(getDailyPipelineSteps({ reportEmailEnabled: true }), [
    "plan_topic",
    "generate_text",
    "generate_image",
    "approve_or_wait",
    "publish",
    "report",
  ]);
});

test("getDailyPipelineSteps includes reel when reels are enabled", () => {
  assert.deepEqual(getDailyPipelineSteps({ reportEmailEnabled: true, reelsEnabled: true }), [
    "plan_topic",
    "generate_text",
    "generate_image",
    "approve_or_wait",
    "publish",
    "reel",
    "report",
  ]);
});

test("buildPipelineEvent creates stable event type and payload", () => {
  const event = buildPipelineEvent({
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

test("runPipelineSteps runs steps in order and returns results", async () => {
  const calls: string[] = [];
  const context: PipelineContext = { runDate: "2026-06-16", scheduledSlot: "morning_09", source: "manual", state: {} };
  const steps: PipelineStep[] = [
    {
      name: "plan_topic",
      async run() {
        calls.push("plan_topic");
        return { step: "plan_topic", status: "completed" };
      },
    },
    {
      name: "publish",
      async run() {
        calls.push("publish");
        return { step: "publish", status: "skipped", message: "safe mode" };
      },
    },
  ];

  const results = await runPipelineSteps(context, steps);

  assert.deepEqual(calls, ["plan_topic", "publish"]);
  assert.deepEqual(results, [
    { step: "plan_topic", status: "completed", payload: { durationMs: results[0]?.payload?.durationMs } },
    { step: "publish", status: "skipped", message: "safe mode", payload: { durationMs: results[1]?.payload?.durationMs } },
  ]);
  assert.equal(typeof results[0]?.payload?.durationMs, "number");
  assert.equal(typeof results[1]?.payload?.durationMs, "number");
});

test("runPipelineSteps stops after failed step", async () => {
  const calls: string[] = [];
  const context: PipelineContext = { runDate: "2026-06-16", scheduledSlot: "morning_09", source: "manual", state: {} };
  const steps: PipelineStep[] = [
    {
      name: "generate_text",
      async run() {
        calls.push("generate_text");
        throw new Error("provider failed");
      },
    },
    {
      name: "publish",
      async run() {
        calls.push("publish");
        return { step: "publish", status: "completed" };
      },
    },
  ];

  await assert.rejects(() => runPipelineSteps(context, steps), /provider failed/);
  assert.deepEqual(calls, ["generate_text"]);
});
