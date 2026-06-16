-- 007_get_active_publish_target.sql
-- Input: :platform (TEXT) e.g. facebook
SELECT id, platform, page_id, page_name
FROM publish_targets
WHERE platform = :platform
  AND is_active = TRUE
ORDER BY id ASC
LIMIT 1;
