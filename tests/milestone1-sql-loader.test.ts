import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
    "036_add_scheduled_slots_and_topic_pillars.sql",
  ];

  for (const f of files) {
    const content = loadSqlFile(f);
    assert.ok(content.length > 0, `Expected non-empty SQL in ${f}`);
  }
});

test("duplicate guard sql files exist", () => {
  const sql = loadSqlFile("033_get_existing_post_for_job.sql");
  assert.match(sql, /FROM posts/i);
  assert.match(sql, /WHERE (?:p\.)?job_id = :job_id/i);
});

test("targeted publish sql file exists", () => {
  const sql = loadSqlFile("037_get_post_ready_to_publish_by_id.sql");
  assert.match(sql, /WHERE p\.id = :post_id/i);
});

test("content plan importer does not reapply legacy schema migrations", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/scripts/importContentPlanCsv.ts"), "utf8");
  assert.doesNotMatch(source, /016_create_content_plan\.sql/);
  assert.doesNotMatch(source, /017_add_plan_date_to_content_plan\.sql/);
});
