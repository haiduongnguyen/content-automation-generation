-- 011_mark_job_failed.sql
-- Input: :job_id (BIGINT), :error_message (TEXT)
UPDATE content_jobs
SET status = 'failed',
    error_message = :error_message,
    updated_at = NOW()
WHERE id = :job_id
RETURNING id, status, error_message, updated_at;
