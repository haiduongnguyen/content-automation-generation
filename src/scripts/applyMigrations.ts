import fs from "node:fs";
import path from "node:path";
import { pool } from "../db/pool";

const MIGRATION_FILES = [
  "000_create_core_schema.sql",
  "013_create_openai_usage_logs.sql",
  "016_create_content_plan.sql",
  "017_add_plan_date_to_content_plan.sql",
  "018_create_post_images.sql",
  "021_create_plan_batches.sql",
  "022_create_topic_plan_draft.sql",
  "025_add_provider_tracking_to_posts.sql",
  "026_create_pipeline_jobs.sql",
  "027_create_pipeline_job_events.sql",
  "036_add_scheduled_slots_and_topic_pillars.sql",
  "038_create_provider_operations.sql",
  "039_create_quarterly_topic_plans.sql",
  "040_create_reels.sql",
];

function loadMigration(filename: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), "sql", filename), "utf8").replace(/^\uFEFF/, "");
}

async function upsertFacebookTarget(): Promise<void> {
  const pageId = process.env.FB_PAGE_ID?.trim();
  if (!pageId) {
    return;
  }
  await pool.query(
    `
    INSERT INTO publish_targets (platform, page_id, page_name, is_active, updated_at)
    VALUES ('facebook', $1, $2, true, NOW())
    ON CONFLICT (platform, page_id)
    DO UPDATE SET
      page_name = COALESCE(EXCLUDED.page_name, publish_targets.page_name),
      is_active = true,
      updated_at = NOW()
    `,
    [pageId, process.env.FB_PAGE_NAME?.trim() || null]
  );
}

export async function applyMigrations(): Promise<void> {
  for (const file of MIGRATION_FILES) {
    await pool.query(loadMigration(file));
    console.log(`applied ${file}`);
  }
  await upsertFacebookTarget();
}

if (require.main === module) {
  applyMigrations()
    .catch((err) => {
      console.error("db:migrate failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
