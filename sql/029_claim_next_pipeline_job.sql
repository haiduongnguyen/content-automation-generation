-- 029_claim_next_pipeline_job.sql
-- Input:
-- :worker_id (TEXT)
UPDATE pipeline_jobs
SET status = 'running',
    attempt_count = attempt_count + 1,
    locked_at = NOW(),
    locked_by = :worker_id,
    error_message = NULL,
    updated_at = NOW()
WHERE id = (
  SELECT id
  FROM pipeline_jobs
  WHERE status = 'queued'
    AND attempt_count < max_attempts
  ORDER BY run_date ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING id, job_type, run_date, status, attempt_count, max_attempts, locked_at, locked_by, payload, error_message, created_at, updated_at;
