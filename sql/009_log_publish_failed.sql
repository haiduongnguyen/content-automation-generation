-- 009_log_publish_failed.sql
-- Input:
-- :post_id (BIGINT)
-- :target_id (BIGINT)
-- :error_message (TEXT)
-- :response_payload_json (JSON string)
WITH next_attempt AS (
  SELECT COALESCE(MAX(attempt_no), 0) + 1 AS attempt_no
  FROM publish_attempts
  WHERE post_id = :post_id
    AND target_id = :target_id
)
INSERT INTO publish_attempts (
  post_id, target_id, attempt_no, status, error_message, response_payload
)
SELECT :post_id,
       :target_id,
       n.attempt_no,
       'failed',
       :error_message,
       CAST(:response_payload_json AS jsonb)
FROM next_attempt n
RETURNING id, post_id, target_id, attempt_no, status, created_at;
