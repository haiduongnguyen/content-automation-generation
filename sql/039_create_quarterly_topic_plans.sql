ALTER TABLE pipeline_jobs
DROP CONSTRAINT IF EXISTS pipeline_jobs_job_type_check;

ALTER TABLE pipeline_jobs
ADD CONSTRAINT pipeline_jobs_job_type_check
CHECK (job_type IN ('daily_content', 'publish', 'report', 'backfill', 'quarterly_topic_plan'));

CREATE TABLE IF NOT EXISTS quarterly_topic_batches (
  id BIGSERIAL PRIMARY KEY,
  quarter_key TEXT NOT NULL UNIQUE,
  quarter_start DATE NOT NULL,
  quarter_end DATE NOT NULL,
  scheduled_slots JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'active', 'failed', 'archived')),
  expected_topic_count INT NOT NULL CHECK (expected_topic_count > 0),
  generated_topic_count INT NOT NULL DEFAULT 0 CHECK (generated_topic_count >= 0),
  error_message TEXT,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quarterly_topic_drafts (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES quarterly_topic_batches(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  scheduled_slot TEXT NOT NULL,
  pillar_id BIGINT REFERENCES content_pillars(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  key_notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, plan_date, scheduled_slot)
);

ALTER TABLE content_plan
ADD COLUMN IF NOT EXISTS quarterly_batch_id BIGINT REFERENCES quarterly_topic_batches(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS uq_content_plan_day_slot;

CREATE INDEX IF NOT EXISTS idx_content_plan_day_slot
ON content_plan(day_no, scheduled_slot);

CREATE INDEX IF NOT EXISTS idx_quarterly_topic_drafts_batch_date
ON quarterly_topic_drafts(batch_id, plan_date, scheduled_slot);
