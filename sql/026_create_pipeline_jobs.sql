-- 026_create_pipeline_jobs.sql
CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('daily_content', 'publish', 'report', 'backfill')),
  run_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_type, run_date)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_claim
ON pipeline_jobs(status, run_date, created_at)
WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status_updated
ON pipeline_jobs(status, updated_at);
