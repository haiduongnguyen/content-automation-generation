-- 006_get_posts_ready_to_publish.sql
-- Use this when you have a manual approval step in MVP1.
SELECT p.id,
       p.job_id,
       p.title,
       p.body,
       p.cta,
       p.hashtags,
       p.model_name,
       p.prompt_version,
       t.name AS topic_name
FROM posts p
LEFT JOIN topics t ON t.id = p.topic_id
WHERE p.approval_status IN ('approved', 'auto_approved')
  AND NOT EXISTS (
    SELECT 1
    FROM publish_attempts pa
    WHERE pa.post_id = p.id
      AND pa.status = 'success'
  )
ORDER BY p.created_at DESC
LIMIT 20;
