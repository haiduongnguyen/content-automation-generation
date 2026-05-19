-- 016_create_content_plan.sql
CREATE TABLE IF NOT EXISTS content_plan (
  id BIGSERIAL PRIMARY KEY,
  day_no INTEGER NOT NULL UNIQUE CHECK (day_no > 0),
  topic TEXT NOT NULL,
  key_notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_plan_active_day
ON content_plan(is_active, day_no);
