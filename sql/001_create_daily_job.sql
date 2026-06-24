-- 001_create_daily_job.sql
-- Input:
-- :run_date (DATE, format YYYY-MM-DD)
-- :scheduled_slot (TEXT)
-- Output: 1 row with job id
INSERT INTO content_jobs (run_date, scheduled_slot, status)
VALUES (:run_date, :scheduled_slot, 'queued')
ON CONFLICT (run_date, scheduled_slot)
DO UPDATE SET updated_at = NOW()
RETURNING id, run_date, scheduled_slot, status, created_at, updated_at;
