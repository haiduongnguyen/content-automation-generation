-- 022_create_topic_plan_draft.sql
CREATE TABLE IF NOT EXISTS topic_plan_draft (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES plan_batches(id) ON DELETE CASCADE,
  day_no INT NOT NULL CHECK (day_no > 0),
  topic TEXT NOT NULL,
  key_notes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, day_no)
);
