-- 014_get_openai_usage_summary_today.sql
-- Input: :request_date (DATE)
SELECT
  COUNT(*)::INT AS request_count,
  COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC(12,6) AS total_cost_usd
FROM openai_usage_logs
WHERE request_date = :request_date
  AND status IN ('success','failed');
