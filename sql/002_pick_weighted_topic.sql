-- 002_pick_weighted_topic.sql
-- Output: 1 active topic by weight
SELECT id, name, weight
FROM topics
WHERE status = 'active'
ORDER BY random() * weight DESC
LIMIT 1;
