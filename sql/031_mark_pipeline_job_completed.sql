-- 031_mark_pipeline_job_completed.sql
-- Input:
-- :job_id (BIGINT)
UPDATE pipeline_jobs
SET status = 'completed',
    locked_at = NULL,
    locked_by = NULL,
    error_message = NULL,
    updated_at = NOW()
WHERE id = :job_id
RETURNING id, job_type, run_date::text AS run_date, scheduled_slot, status, attempt_count, max_attempts, locked_at, locked_by, payload, error_message, created_at, updated_at;
