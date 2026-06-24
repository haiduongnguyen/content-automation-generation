CREATE TABLE IF NOT EXISTS reels (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  render_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rendered'
    CHECK (status IN ('rendered', 'uploading', 'published', 'failed')),
  video_key TEXT NOT NULL,
  duration_seconds NUMERIC(8,3) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  fps NUMERIC(8,3) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  platform_reel_id TEXT,
  platform_permalink TEXT,
  published_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_status
ON reels(status);

CREATE TABLE IF NOT EXISTS reel_publish_attempts (
  id BIGSERIAL PRIMARY KEY,
  reel_id BIGINT NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  target_id BIGINT NOT NULL REFERENCES publish_targets(id) ON DELETE CASCADE,
  attempt_no INT NOT NULL CHECK (attempt_no > 0),
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed')),
  platform_video_id TEXT,
  error_message TEXT,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (reel_id, target_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_reel_publish_attempts_reel_target
ON reel_publish_attempts(reel_id, target_id, attempt_no DESC);
