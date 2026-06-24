-- 028_enqueue_pipeline_job.sql
-- Input:
-- :job_type (TEXT)
-- :run_date (DATE)
-- :scheduled_slot (TEXT)
-- :max_attempts (INT)
-- :payload_json (JSON string)
INSERT INTO pipeline_jobs (job_type, run_date, scheduled_slot, max_attempts, payload)
VALUES (
  :job_type,
  :run_date,
  :scheduled_slot,
  :max_attempts,
  COALESCE(CAST(:payload_json AS jsonb), '{}'::jsonb)
)
ON CONFLICT (job_type, run_date, scheduled_slot)
DO UPDATE SET
  updated_at = NOW()
RETURNING id, job_type, run_date::text AS run_date, scheduled_slot, status, attempt_count, max_attempts, locked_at, locked_by, payload, error_message, created_at, updated_at;
