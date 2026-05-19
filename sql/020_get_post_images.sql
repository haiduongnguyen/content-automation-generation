-- 020_get_post_images.sql
-- :post_id
SELECT id, post_id, image_role, prompt, mime_type, image_b64, created_at
FROM post_images
WHERE post_id = :post_id
ORDER BY
  CASE image_role
    WHEN 'practical_example' THEN 1
    WHEN 'formula_ai_application' THEN 2
    ELSE 99
  END ASC;
