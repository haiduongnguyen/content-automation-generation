-- 032_mark_pipeline_job_failed.sql
-- Input:
-- :job_id (BIGINT)
-- :error_message (TEXT)
UPDATE pipeline_jobs
SET status = 'failed',
    locked_at = NULL,
    locked_by = NULL,
    error_message = :error_message,
    updated_at = NOW()
WHERE id = :job_id
RETURNING id, job_type, run_date::text AS run_date, scheduled_slot, status, attempt_count, max_attempts, locked_at, locked_by, payload, error_message, created_at, updated_at;
