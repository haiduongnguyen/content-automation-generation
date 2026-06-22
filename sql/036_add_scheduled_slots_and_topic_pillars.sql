-- 036_add_scheduled_slots_and_topic_pillars.sql
-- Add schedule slots so one calendar date can safely produce multiple posts.

ALTER TABLE content_jobs
ADD COLUMN IF NOT EXISTS scheduled_slot TEXT NOT NULL DEFAULT 'default';

ALTER TABLE pipeline_jobs
ADD COLUMN IF NOT EXISTS scheduled_slot TEXT NOT NULL DEFAULT 'default';

ALTER TABLE content_plan
ADD COLUMN IF NOT EXISTS scheduled_slot TEXT NOT NULL DEFAULT 'default';

ALTER TABLE content_plan
ADD COLUMN IF NOT EXISTS topic_source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE content_plan
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS content_pillars (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  weight NUMERIC(10,4) NOT NULL DEFAULT 1 CHECK (weight >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE content_plan
ADD COLUMN IF NOT EXISTS pillar_id BIGINT REFERENCES content_pillars(id) ON DELETE SET NULL;

ALTER TABLE content_jobs
DROP CONSTRAINT IF EXISTS content_jobs_run_date_key;

ALTER TABLE pipeline_jobs
DROP CONSTRAINT IF EXISTS pipeline_jobs_job_type_run_date_key;

ALTER TABLE content_plan
DROP CONSTRAINT IF EXISTS content_plan_day_no_key;

DROP INDEX IF EXISTS uq_content_plan_plan_date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_jobs_run_date_slot
ON content_jobs(run_date, scheduled_slot);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pipeline_jobs_type_run_date_slot
ON pipeline_jobs(job_type, run_date, scheduled_slot);

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_plan_plan_date_slot
ON content_plan(plan_date, scheduled_slot)
WHERE plan_date IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_plan_day_slot
ON content_plan(day_no, scheduled_slot);

CREATE INDEX IF NOT EXISTS idx_content_plan_plan_date_slot_active
ON content_plan(plan_date, scheduled_slot, is_active, status);

CREATE INDEX IF NOT EXISTS idx_content_pillars_active_weight
ON content_pillars(is_active, weight);

INSERT INTO content_pillars (name, description, weight, is_active, updated_at)
VALUES
  ('math_foundation', 'Nen tang toan hoc can thiet de hieu AI va Machine Learning.', 1.2, true, NOW()),
  ('ai_intuition', 'Giai thich AI bang truc giac, vi du gan doi song va hinh anh de hieu.', 1.3, true, NOW()),
  ('ml_algorithms', 'Cac thuat toan ML cot loi va cach chung hoc tu du lieu.', 1.0, true, NOW()),
  ('data_examples', 'Vi du du lieu thuc te, cach bien bai toan thanh dac trung, nhan, va du doan.', 1.0, true, NOW()),
  ('teacher_student_practical', 'Ung dung thuc te cho hoc sinh, sinh vien, giao vien va nguoi moi hoc AI.', 1.1, true, NOW())
ON CONFLICT (name)
DO UPDATE SET
  description = EXCLUDED.description,
  weight = EXCLUDED.weight,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
