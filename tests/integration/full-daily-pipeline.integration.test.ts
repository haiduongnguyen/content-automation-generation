import test from "node:test";
import assert from "node:assert/strict";

function configureFullPipelineEnv(): void {
  process.env.PGHOST = process.env.TEST_PGHOST ?? process.env.PGHOST ?? "localhost";
  process.env.PGPORT = process.env.TEST_PGPORT ?? process.env.PGPORT ?? "5432";
  process.env.PGDATABASE = process.env.TEST_PGDATABASE ?? process.env.PGDATABASE ?? "content_automation_test";
  process.env.PGUSER = process.env.TEST_PGUSER ?? process.env.PGUSER ?? "postgres";
  process.env.PGPASSWORD = process.env.TEST_PGPASSWORD ?? process.env.PGPASSWORD ?? "postgres";
  process.env.FB_GRAPH_VERSION = "v25.0";
  process.env.FB_PAGE_ID = "test-page";
  process.env.FB_PAGE_NAME = "Test Page";
  process.env.FB_PAGE_ACCESS_TOKEN = "";
  process.env.PUBLISH_ENABLED = "false";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL = "gpt-5-mini";
  process.env.GEMINI_API = "test-gemini-key";
  process.env.GEMINI_MODEL = "gemini-2.5-flash";
  process.env.TEXT_PROVIDER = "gemini_first";
  process.env.TEXT_FALLBACK_PROVIDER = "none";
  process.env.IMAGE_GENERATION_ENABLED = "false";
  process.env.IMAGE_FAILURE_MODE = "continue_text_only";
  process.env.AUTO_APPROVE = "true";
  process.env.REPORT_EMAIL_ENABLED = "false";
  process.env.ARTIFACT_ROOT = process.env.TEST_ARTIFACT_ROOT ?? "storage/test-jobs";
}

test("full daily pipeline integration: worker generates, approves, safe-publish skips, and completes job", { skip: process.env.TEST_INTEGRATION_DB !== "true" }, async () => {
  configureFullPipelineEnv();

  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const urlText = String(url);
    assert.match(urlText, /generativelanguage\.googleapis\.com/);
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: "Gradient descent la gi?",
                    body: "Gradient descent giup mo hinh AI tu sua sai bang cach di tung buoc nho theo huong lam loi giam dan.",
                    cta: "Ban muon minh minh hoa bang vi du nao tiep theo?",
                    hashtags: ["#AI", "#MachineLearning", "#ToanUngDung"],
                  }),
                },
              ],
            },
          },
        ],
      }),
      text: async () => "",
    } as Response;
  }) as typeof fetch;

  const { applyMigrations } = await import("../../src/scripts/applyMigrations");
  const { pool } = await import("../../src/db/pool");
  const { enqueuePipelineJob } = await import("../../src/services/pipelineJobs");
  const { workerOnce } = await import("../../src/scripts/workerOnce");

  try {
    await applyMigrations();
    await pool.query(`
      DELETE FROM pipeline_job_events;
      DELETE FROM pipeline_jobs;
      DELETE FROM publish_attempts;
      DELETE FROM post_images;
      DELETE FROM posts;
      DELETE FROM content_jobs;
      DELETE FROM content_plan;
      DELETE FROM topics;
      DELETE FROM publish_targets;
    `);

    await pool.query(
      `
      INSERT INTO content_plan (day_no, topic, key_notes, is_active, plan_date)
      VALUES (17, 'Gradient descent trong AI', 'Full pipeline integration topic', true, '2026-06-17')
      `
    );
    await pool.query(
      `
      INSERT INTO publish_targets (platform, page_id, page_name, is_active)
      VALUES ('facebook', 'test-page', 'Test Page', true)
      `
    );

    const queued = await enqueuePipelineJob({
      jobType: "daily_content",
      runDate: "2026-06-17",
      maxAttempts: 3,
      payload: { source: "full-integration" },
    });

    await workerOnce();

    const job = await pool.query<{ status: string; attempt_count: number }>(
      "SELECT status, attempt_count FROM pipeline_jobs WHERE id=$1",
      [queued.id]
    );
    assert.equal(job.rows[0]?.status, "completed");
    assert.equal(job.rows[0]?.attempt_count, 1);

    const contentJob = await pool.query<{ id: string; status: string }>(
      "SELECT id::text, status FROM content_jobs WHERE run_date='2026-06-17'"
    );
    assert.equal(contentJob.rows[0]?.status, "generated");

    const posts = await pool.query<{
      approval_status: string;
      provider_used: string;
      fallback_used: boolean;
      title: string;
    }>("SELECT approval_status, provider_used, fallback_used, title FROM posts");
    assert.equal(posts.rowCount, 1);
    assert.equal(posts.rows[0]?.approval_status, "auto_approved");
    assert.equal(posts.rows[0]?.provider_used, "gemini");
    assert.equal(posts.rows[0]?.fallback_used, false);
    assert.equal(posts.rows[0]?.title, "Gradient descent la gi?");

    const publishAttempts = await pool.query("SELECT id FROM publish_attempts");
    assert.equal(publishAttempts.rowCount, 0);

    const eventTypes = await pool.query<{ event_type: string; payload: { durationMs?: number } }>(
      "SELECT event_type, payload FROM pipeline_job_events WHERE job_id=$1 ORDER BY id ASC",
      [queued.id]
    );
    const types = eventTypes.rows.map((row) => row.event_type);
    assert.deepEqual(types, [
      "started",
      "plan_topic_completed",
      "generate_text_completed",
      "generate_image_skipped",
      "approve_or_wait_completed",
      "publish_skipped",
      "completed",
    ]);
    const generateEvent = eventTypes.rows.find((row) => row.event_type === "generate_text_completed");
    assert.equal(typeof generateEvent?.payload.durationMs, "number");
  } finally {
    globalThis.fetch = previousFetch;
    await pool.end();
  }
});
