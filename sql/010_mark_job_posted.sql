-- 010_mark_job_posted.sql
-- Input: :job_id (BIGINT)
UPDATE content_jobs
SET status = 'posted',
    error_message = NULL,
    updated_at = NOW()
WHERE id = :job_id
RETURNING id, status, updated_at;
