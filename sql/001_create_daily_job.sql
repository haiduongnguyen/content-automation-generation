-- 001_create_daily_job.sql
-- Input: :run_date (DATE, format YYYY-MM-DD)
-- Output: 1 row with job id
INSERT INTO content_jobs (run_date, status)
VALUES (:run_date, 'queued')
ON CONFLICT (run_date)
DO UPDATE SET updated_at = NOW()
RETURNING id, run_date, status, created_at, updated_at;
