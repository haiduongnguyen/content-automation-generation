CREATE TABLE IF NOT EXISTS provider_operations (
  id BIGSERIAL PRIMARY KEY,
  operation_key TEXT NOT NULL UNIQUE,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('quarterly_topic', 'post_text', 'post_image')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  cache_hit_count INT NOT NULL DEFAULT 0 CHECK (cache_hit_count >= 0),
  input_tokens BIGINT,
  output_tokens BIGINT,
  total_tokens BIGINT,
  cached_tokens BIGINT,
  result_json JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_operations_created_type
ON provider_operations(created_at, operation_type);

CREATE INDEX IF NOT EXISTS idx_provider_operations_status
ON provider_operations(status, updated_at);
