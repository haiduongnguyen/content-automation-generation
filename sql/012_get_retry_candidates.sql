-- 012_get_retry_candidates.sql
-- Input: :max_attempts (INT)
SELECT p.id AS post_id,
       pt.id AS target_id,
       COALESCE(MAX(pa.attempt_no), 0) AS last_attempt_no,
       MAX(pa.created_at) AS last_attempt_at
FROM posts p
JOIN publish_targets pt ON pt.is_active = TRUE
LEFT JOIN publish_attempts pa
  ON pa.post_id = p.id
 AND pa.target_id = pt.id
WHERE p.approval_status IN ('approved', 'auto_approved')
  AND NOT EXISTS (
    SELECT 1
    FROM publish_attempts s
    WHERE s.post_id = p.id
      AND s.target_id = pt.id
      AND s.status = 'success'
  )
GROUP BY p.id, pt.id
HAVING COALESCE(MAX(pa.attempt_no), 0) < :max_attempts
ORDER BY last_attempt_at NULLS FIRST, p.id
LIMIT 50;
