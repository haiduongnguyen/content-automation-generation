-- 008_log_publish_success.sql
-- Input:
-- :post_id (BIGINT)
-- :target_id (BIGINT)
-- :platform_post_id (TEXT)
-- :response_payload_json (JSON string)
WITH next_attempt AS (
  SELECT COALESCE(MAX(attempt_no), 0) + 1 AS attempt_no
  FROM publish_attempts
  WHERE post_id = :post_id
    AND target_id = :target_id
)
INSERT INTO publish_attempts (
  post_id, target_id, attempt_no, status, platform_post_id, response_payload, published_at
)
SELECT :post_id,
       :target_id,
       n.attempt_no,
       'success',
       :platform_post_id,
       CAST(:response_payload_json AS jsonb),
       NOW()
FROM next_attempt n
RETURNING id, post_id, target_id, attempt_no, status, published_at;
