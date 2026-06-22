-- 035_requeue_pipeline_job.sql
-- Input:
-- :job_id (BIGINT)
UPDATE pipeline_jobs
SET status = 'queued',
    locked_at = NULL,
    locked_by = NULL,
    error_message = NULL,
    updated_at = NOW()
WHERE id = :job_id
  AND status = 'failed'
  AND attempt_count < max_attempts
RETURNING id, job_type, run_date::text AS run_date, scheduled_slot, status, attempt_count, max_attempts, locked_at, locked_by, payload, error_message, created_at, updated_at;
