-- 030_insert_pipeline_job_event.sql
-- Input:
-- :job_id (BIGINT)
-- :event_type (TEXT)
-- :message (TEXT, nullable)
-- :payload_json (JSON string)
INSERT INTO pipeline_job_events (job_id, event_type, message, payload)
VALUES (
  :job_id,
  :event_type,
  :message,
  COALESCE(CAST(:payload_json AS jsonb), '{}'::jsonb)
)
RETURNING id, job_id, event_type, message, payload, created_at;
