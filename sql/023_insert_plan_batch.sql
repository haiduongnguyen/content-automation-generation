-- 023_insert_plan_batch.sql
-- :name, :broad_theme, :audience, :language, :difficulty, :total_days
INSERT INTO plan_batches (
  name, broad_theme, audience, language, difficulty, total_days
)
VALUES (
  :name, :broad_theme, :audience, :language, :difficulty, :total_days
)
RETURNING id, status, created_at;
