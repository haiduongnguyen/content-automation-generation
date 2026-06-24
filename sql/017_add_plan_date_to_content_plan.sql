-- 017_add_plan_date_to_content_plan.sql
ALTER TABLE content_plan
ADD COLUMN IF NOT EXISTS plan_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'content_plan'
      AND column_name = 'scheduled_slot'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_content_plan_plan_date
    ON content_plan(plan_date)
    WHERE plan_date IS NOT NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_content_plan_plan_date_active
ON content_plan(plan_date, is_active);
