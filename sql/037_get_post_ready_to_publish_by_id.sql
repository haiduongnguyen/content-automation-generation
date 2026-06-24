-- 037_get_post_ready_to_publish_by_id.sql
-- :post_id
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
WHERE p.id = :post_id
  AND p.approval_status IN ('approved', 'auto_approved')
  AND NOT EXISTS (
    SELECT 1
    FROM publish_attempts pa
    WHERE pa.post_id = p.id
      AND pa.status = 'success'
  )
LIMIT 1;
