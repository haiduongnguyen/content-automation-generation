-- 019_insert_post_image.sql
-- :post_id, :image_role, :prompt, :mime_type, :image_b64
INSERT INTO post_images (
  post_id, image_role, prompt, mime_type, image_b64
)
VALUES (
  :post_id, :image_role, :prompt, :mime_type, :image_b64
)
ON CONFLICT (post_id, image_role)
DO UPDATE SET
  prompt = EXCLUDED.prompt,
  mime_type = EXCLUDED.mime_type,
  image_b64 = EXCLUDED.image_b64,
  created_at = NOW()
RETURNING id;
