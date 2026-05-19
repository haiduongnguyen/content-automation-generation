-- 015_insert_openai_usage_log.sql
-- Input:
-- :request_date (DATE)
-- :model_name (TEXT)
-- :topic_name (TEXT)
-- :status (TEXT)
-- :estimated_cost_usd (NUMERIC)
-- :error_message (TEXT)
INSERT INTO openai_usage_logs (
  request_date, model_name, topic_name, status, estimated_cost_usd, error_message
)
VALUES (
  :request_date,
  :model_name,
  :topic_name,
  :status,
  :estimated_cost_usd,
  :error_message
)
RETURNING id, request_date, model_name, status, estimated_cost_usd, created_at;
