-- 033_get_existing_post_for_job.sql
-- Input:
-- :job_id (BIGINT)
SELECT p.id,
       p.job_id,
       p.approval_status,
       p.title,
       p.body,
       p.cta,
       p.hashtags,
       p.provider_used,
       p.fallback_used,
       COUNT(pi.id)::int AS image_count,
       p.created_at
FROM posts p
LEFT JOIN post_images pi ON pi.post_id = p.id
WHERE p.job_id = :job_id
GROUP BY p.id
ORDER BY p.created_at DESC, p.id DESC
LIMIT 1;
