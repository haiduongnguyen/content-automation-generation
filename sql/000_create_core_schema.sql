-- 000_create_core_schema.sql
CREATE TABLE IF NOT EXISTS content_jobs (
  id BIGSERIAL PRIMARY KEY,
  run_date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'generating', 'generated', 'posted', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topics (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  weight NUMERIC(10,4) NOT NULL DEFAULT 1 CHECK (weight >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topics_status
ON topics(status);

CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
  topic_id BIGINT REFERENCES topics(id) ON DELETE SET NULL,
  title TEXT,
  body TEXT NOT NULL,
  cta TEXT,
  hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  tone TEXT,
  model_name TEXT,
  prompt_version TEXT,
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'approved', 'auto_approved', 'rejected')),
  provider_used TEXT,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_job_id
ON posts(job_id);

CREATE INDEX IF NOT EXISTS idx_posts_approval_status
ON posts(approval_status);

CREATE TABLE IF NOT EXISTS publish_targets (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  page_id TEXT NOT NULL,
  page_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, page_id)
);

CREATE INDEX IF NOT EXISTS idx_publish_targets_platform_active
ON publish_targets(platform, is_active);

CREATE TABLE IF NOT EXISTS publish_attempts (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  target_id BIGINT NOT NULL REFERENCES publish_targets(id) ON DELETE CASCADE,
  attempt_no INT NOT NULL CHECK (attempt_no > 0),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  platform_post_id TEXT,
  error_message TEXT,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, target_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_publish_attempts_post_target_status
ON publish_attempts(post_id, target_id, status);
