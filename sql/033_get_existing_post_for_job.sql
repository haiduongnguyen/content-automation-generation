-- 033_get_existing_post_for_job.sql
-- Input:
-- :job_id (BIGINT)
SELECT id, job_id, approval_status, created_at
FROM posts
WHERE job_id = :job_id
ORDER BY created_at DESC, id DESC
LIMIT 1;
