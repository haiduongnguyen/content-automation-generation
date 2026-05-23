-- 004_insert_post_draft.sql
-- Input:
-- :job_id (BIGINT)
-- :topic_id (BIGINT, nullable)
-- :title (TEXT, nullable)
-- :body (TEXT)
-- :cta (TEXT, nullable)
-- :hashtags_json (JSON string like ["#tag1","#tag2"])
-- :tone (TEXT, nullable)
-- :model_name (TEXT, nullable)
-- :prompt_version (TEXT, nullable)
-- :provider_used (TEXT, nullable)
-- :fallback_used (BOOLEAN)
INSERT INTO posts (
  job_id, topic_id, title, body, cta, hashtags, tone, model_name, prompt_version, approval_status, provider_used, fallback_used
)
VALUES (
  :job_id,
  :topic_id,
  :title,
  :body,
  :cta,
  COALESCE(CAST(:hashtags_json AS jsonb), '[]'::jsonb),
  :tone,
  :model_name,
  :prompt_version,
  'draft',
  :provider_used,
  :fallback_used
)
RETURNING id, job_id, topic_id, approval_status, created_at;
