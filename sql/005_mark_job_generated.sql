-- 005_mark_job_generated.sql
-- Input: :job_id (BIGINT)
UPDATE content_jobs
SET status = 'generated',
    updated_at = NOW()
WHERE id = :job_id
RETURNING id, status, updated_at;
