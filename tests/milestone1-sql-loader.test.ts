import test from "node:test";
import assert from "node:assert/strict";
import { loadSqlFile } from "../src/sql/loader";

test("loads required SQL files for milestone 1", () => {
  const files = [
    "000_create_core_schema.sql",
    "001_create_daily_job.sql",
    "002_pick_weighted_topic.sql",
    "003_mark_job_generating.sql",
    "004_insert_post_draft.sql",
    "005_mark_job_generated.sql",
  ];

  for (const f of files) {
    const content = loadSqlFile(f);
    assert.ok(content.length > 0, `Expected non-empty SQL in ${f}`);
  }
});

test("010_mark_job_posted clears old error_message", () => {
  const sql = loadSqlFile("010_mark_job_posted.sql");
  assert.match(sql, /error_message\s*=\s*NULL/i);
});

test("openai usage sql files exist", () => {
  const files = [
    "013_create_openai_usage_logs.sql",
    "014_get_openai_usage_summary_today.sql",
    "015_insert_openai_usage_log.sql",
  ];

  for (const f of files) {
    const content = loadSqlFile(f);
    assert.ok(content.length > 0, `Expected non-empty SQL in ${f}`);
  }
});

test("topic plan draft sql files exist", () => {
  const files = [
    "021_create_plan_batches.sql",
    "022_create_topic_plan_draft.sql",
    "023_insert_plan_batch.sql",
    "024_insert_topic_plan_draft_row.sql",
    "025_add_provider_tracking_to_posts.sql",
  ];

  for (const f of files) {
    const content = loadSqlFile(f);
    assert.ok(content.length > 0, `Expected non-empty SQL in ${f}`);
  }
});

test("pipeline job sql files exist", () => {
  const files = [
    "026_create_pipeline_jobs.sql",
    "027_create_pipeline_job_events.sql",
    "028_enqueue_pipeline_job.sql",
    "029_claim_next_pipeline_job.sql",
    "030_insert_pipeline_job_event.sql",
    "031_mark_pipeline_job_completed.sql",
    "032_mark_pipeline_job_failed.sql",
    "034_get_retryable_pipeline_jobs.sql",
    "035_requeue_pipeline_job.sql",
  ];

  for (const f of files) {
    const content = loadSqlFile(f);
    assert.ok(content.length > 0, `Expected non-empty SQL in ${f}`);
  }
});

test("duplicate guard sql files exist", () => {
  const sql = loadSqlFile("033_get_existing_post_for_job.sql");
  assert.match(sql, /FROM posts/i);
  assert.match(sql, /WHERE job_id = :job_id/i);
});
