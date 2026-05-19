-- 018_create_post_images.sql
CREATE TABLE IF NOT EXISTS post_images (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  image_role TEXT NOT NULL CHECK (image_role IN ('practical_example', 'formula_ai_application')),
  prompt TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  image_b64 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, image_role)
);
