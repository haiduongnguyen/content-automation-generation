import test from "node:test";
import assert from "node:assert/strict";
import { loadSqlFile } from "../src/sql/loader";

test("loads required SQL files for milestone 1", () => {
  const files = [
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
