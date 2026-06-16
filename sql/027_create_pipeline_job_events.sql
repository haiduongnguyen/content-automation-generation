-- 027_create_pipeline_job_events.sql
CREATE TABLE IF NOT EXISTS pipeline_job_events (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES pipeline_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_job_events_job_id_created
ON pipeline_job_events(job_id, created_at);
