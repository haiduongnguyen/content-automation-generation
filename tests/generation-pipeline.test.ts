import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGeneratedGenerateResult,
  buildGeneratedPostContentText,
  buildSkippedGenerateResult,
  dateFromRunDate,
  summarizeImagesForArtifact,
  type GenerationContext,
} from "../src/services/generationPipeline";

test("dateFromRunDate anchors the date at Vietnam noon", () => {
  assert.equal(dateFromRunDate("2026-06-17").toISOString(), "2026-06-17T05:00:00.000Z");
});

test("buildGeneratedPostContentText joins non-empty content blocks", () => {
  assert.equal(
    buildGeneratedPostContentText({
      title: "Title",
      body: "Body",
      cta: "",
      hashtags: ["#ai"],
    }),
    "Title\n\nBody"
  );
});

test("summarizeImagesForArtifact omits base64 image payloads", () => {
  const summary = summarizeImagesForArtifact([
    {
      role: "practical_example",
      prompt: "Image prompt",
      mimeType: "image/png",
      b64Data: Buffer.from("image-bytes").toString("base64"),
    },
  ]);

  assert.deepEqual(summary, [
    {
      role: "practical_example",
      prompt: "Image prompt",
      mimeType: "image/png",
      b64Bytes: 11,
    },
  ]);
  assert.equal("b64Data" in summary[0], false);
});

test("buildSkippedGenerateResult preserves existing post approval status", () => {
  const context = {
    job: { id: "10" },
  } as GenerationContext;

  assert.deepEqual(
    buildSkippedGenerateResult(context, {
      id: "20",
      job_id: "10",
      approval_status: "draft",
      title: "Title",
      body: "Body",
      cta: "CTA",
      hashtags: ["#ai"],
      provider_used: "gemini",
      fallback_used: false,
      image_count: 0,
      created_at: "2026-06-17T00:00:00.000Z",
    }),
    {
      status: "skipped",
      reason: "Existing post already generated for job",
      jobId: "10",
      postId: "20",
      approvalStatus: "draft",
    }
  );
});

test("buildGeneratedGenerateResult returns the CLI-compatible result shape", () => {
  const previousEnv = { ...process.env };
  Object.assign(process.env, {
    PGHOST: "localhost",
    PGPORT: "5432",
    PGDATABASE: "content_automation",
    PGUSER: "postgres",
    PGPASSWORD: "postgres",
    FB_GRAPH_VERSION: "v25.0",
    FB_PAGE_ACCESS_TOKEN: "",
    PUBLISH_ENABLED: "false",
    OPENAI_API_KEY: "test-key",
    AUTO_APPROVE: "true",
  });

  try {
    const result = buildGeneratedGenerateResult({
      runDate: "2026-06-17",
      scheduledSlot: "morning_09",
      now: new Date("2026-06-17T05:00:00.000Z"),
      job: { id: "10" },
      chosenTopic: { topicName: "Gradient descent", topicId: null, plannedDayNo: 17 },
      existingPost: null,
      generated: {
        content: {
          title: "Title",
          body: "Body",
          cta: "CTA",
          hashtags: ["#ai"],
        },
        providerUsed: "gemini",
        fallbackUsed: false,
      },
      post: { id: "20" },
      images: [
        {
          role: "practical_example",
          prompt: "Prompt",
          mimeType: "image/png",
          b64Data: "abc",
        },
      ],
      existingImageCount: 0,
      resumedExistingDraft: false,
      imageErrorMessage: null,
    });

    assert.deepEqual(result, {
      status: "generated",
      jobId: "10",
      topicId: null,
      plannedDayNo: 17,
      chosenTopicName: "Gradient descent",
      postId: "20",
      approvalMode: "auto_approved",
      providerUsed: "gemini",
      fallbackUsed: false,
      imageCount: 1,
      imageError: null,
    });
  } finally {
    process.env = previousEnv;
  }
});
