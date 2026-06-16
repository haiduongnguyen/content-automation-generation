-- 034_get_retryable_pipeline_jobs.sql
SELECT id, job_type, run_date, status, attempt_count, max_attempts, locked_at, locked_by, payload, error_message, created_at, updated_at
FROM pipeline_jobs
WHERE status = 'failed'
  AND attempt_count < max_attempts
ORDER BY updated_at ASC, id ASC;
