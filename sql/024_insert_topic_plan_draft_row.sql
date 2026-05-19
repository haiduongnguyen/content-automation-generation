-- 024_insert_topic_plan_draft_row.sql
-- :batch_id, :day_no, :topic, :key_notes, :status
INSERT INTO topic_plan_draft (
  batch_id, day_no, topic, key_notes, status
)
VALUES (
  :batch_id, :day_no, :topic, :key_notes, :status
)
RETURNING id;
