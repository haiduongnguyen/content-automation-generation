-- 013_create_openai_usage_logs.sql
CREATE TABLE IF NOT EXISTS openai_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  request_date DATE NOT NULL,
  model_name TEXT NOT NULL,
  topic_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('success','failed','blocked')),
  estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_openai_usage_logs_request_date
ON openai_usage_logs(request_date);
