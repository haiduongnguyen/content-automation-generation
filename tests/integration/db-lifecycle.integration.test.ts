import test from "node:test";
import assert from "node:assert/strict";
import type { ExistingPostForJob } from "../../src/services/postDuplicateGuard";

function configurePgEnvFromTestEnv(): void {
  process.env.PGHOST = process.env.TEST_PGHOST ?? process.env.PGHOST ?? "localhost";
  process.env.PGPORT = process.env.TEST_PGPORT ?? process.env.PGPORT ?? "5432";
  process.env.PGDATABASE = process.env.TEST_PGDATABASE ?? process.env.PGDATABASE ?? "content_automation_test";
  process.env.PGUSER = process.env.TEST_PGUSER ?? process.env.PGUSER ?? "postgres";
  process.env.PGPASSWORD = process.env.TEST_PGPASSWORD ?? process.env.PGPASSWORD ?? "postgres";
  process.env.FB_GRAPH_VERSION = process.env.FB_GRAPH_VERSION ?? "v25.0";
  process.env.FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN ?? "";
  process.env.PUBLISH_ENABLED = process.env.PUBLISH_ENABLED ?? "false";
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";
}

test("database integration: migrations and core job lifecycle", { skip: process.env.TEST_INTEGRATION_DB !== "true" }, async () => {
  configurePgEnvFromTestEnv();

  const { applyMigrations } = await import("../../src/scripts/applyMigrations");
  const { pool } = await import("../../src/db/pool");
  const {
    claimNextPipelineJob,
    enqueuePipelineJob,
    insertPipelineJobEvent,
    markPipelineJobFailed,
    requeuePipelineJob,
  } = await import("../../src/services/pipelineJobs");
  const { queryManyFromFile, queryOneFromFile } = await import("../../src/db/sqlRunner");
  const { shouldSkipGenerateForExistingPost } = await import("../../src/services/postDuplicateGuard");
  const { approvePost } = await import("../../src/services/operations/posts");

  try {
    await applyMigrations();
    await pool.query(`
      DELETE FROM pipeline_job_events;
      DELETE FROM pipeline_jobs;
      DELETE FROM post_images;
      DELETE FROM posts;
      DELETE FROM content_jobs;
      DELETE FROM content_plan;
      DELETE FROM topics;
    `);

    const queued = await enqueuePipelineJob({
      jobType: "daily_content",
      runDate: "2026-06-17",
      maxAttempts: 3,
      payload: { source: "integration" },
    });
    assert.equal(queued.status, "queued");

    const claimed = await claimNextPipelineJob("integration-worker");
    assert.ok(claimed);
    assert.equal(claimed.status, "running");
    assert.equal(Number(claimed.attempt_count), 1);

    const event = await insertPipelineJobEvent({
      jobId: Number(claimed.id),
      eventType: "integration_test",
      message: "integration event",
      payload: { ok: true },
    });
    assert.equal(event.event_type, "integration_test");

    const failed = await markPipelineJobFailed({
      jobId: Number(claimed.id),
      errorMessage: "test failure",
    });
    assert.equal(failed.status, "failed");

    const requeued = await requeuePipelineJob(Number(claimed.id));
    assert.ok(requeued);
    assert.equal(requeued.status, "queued");

    const contentJob = await queryOneFromFile<{ id: string }>("001_create_daily_job.sql", {
      run_date: "2026-06-17",
      scheduled_slot: "default",
    });
    await pool.query(
      `
      INSERT INTO content_plan (day_no, plan_date, scheduled_slot, topic, key_notes, topic_source, status, is_active)
      VALUES (17, '2026-06-17', 'default', 'Integration topic', 'Integration notes', 'manual', 'active', true)
      `
    );
    const post = await queryOneFromFile<{ id: string }>("004_insert_post_draft.sql", {
      job_id: Number(contentJob.id),
      topic_id: null,
      title: "Integration title",
      body: "Integration body",
      cta: "Integration cta",
      hashtags_json: JSON.stringify(["#ai"]),
      tone: "practical",
      model_name: "test",
      prompt_version: "test",
      provider_used: "test",
      fallback_used: false,
    });
    assert.ok(post.id);
    await queryOneFromFile("019_insert_post_image.sql", {
      post_id: Number(post.id),
      image_role: "practical_example",
      prompt: "Existing image prompt",
      mime_type: "image/png",
      image_b64: Buffer.from("existing-image").toString("base64"),
    });

    const existing = await queryManyFromFile<ExistingPostForJob>("033_get_existing_post_for_job.sql", {
      job_id: Number(contentJob.id),
    });
    assert.equal(existing.length, 1);
    assert.equal(shouldSkipGenerateForExistingPost(existing[0] ?? null), false);

    const { prepareGenerationContext } = await import("../../src/services/generationPipeline");
    const resumed = await prepareGenerationContext({ runDate: "2026-06-17", scheduledSlot: "default" });
    assert.equal(resumed.resumedExistingDraft, true);
    assert.equal(resumed.post?.id, post.id);
    assert.equal(resumed.generated?.content.body, "Integration body");
    assert.equal(resumed.existingImageCount, 1);

    const approved = await approvePost(Number(post.id));
    assert.equal(approved.approval_status, "approved");
    await pool.query("DELETE FROM pipeline_jobs WHERE job_type = 'daily_content'");
    await pool.query(
      `
      INSERT INTO publish_targets (platform, page_id, page_name, is_active)
      VALUES ('facebook', 'integration-page', 'Integration Page', true)
      ON CONFLICT (platform, page_id) DO UPDATE SET is_active = true
      `
    );
    await approvePost(Number(post.id));
    const publishJob = await pool.query<{ job_type: string; scheduled_slot: string; payload: { postId?: number } }>(
      `
      SELECT job_type, scheduled_slot, payload
      FROM pipeline_jobs
      WHERE job_type = 'publish'
        AND run_date = '2026-06-17'
        AND scheduled_slot = 'default'
      `
    );
    assert.equal(publishJob.rowCount, 1);
    assert.equal(publishJob.rows[0]?.payload.postId, Number(post.id));

    const { workerOnce } = await import("../../src/scripts/workerOnce");
    await workerOnce();
    const completedPublishJob = await pool.query<{ status: string }>(
      "SELECT status FROM pipeline_jobs WHERE job_type = 'publish' AND run_date = '2026-06-17' AND scheduled_slot = 'default'"
    );
    assert.equal(completedPublishJob.rows[0]?.status, "completed");
  } finally {
    await pool.end();
  }
});
