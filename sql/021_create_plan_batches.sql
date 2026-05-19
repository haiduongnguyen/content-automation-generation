-- 021_create_plan_batches.sql
CREATE TABLE IF NOT EXISTS plan_batches (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  broad_theme TEXT NOT NULL,
  audience TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'vi',
  difficulty TEXT NOT NULL DEFAULT 'beginner',
  total_days INT NOT NULL CHECK (total_days > 0 AND total_days <= 365),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
