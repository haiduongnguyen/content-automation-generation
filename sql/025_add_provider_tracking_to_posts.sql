-- 025_add_provider_tracking_to_posts.sql
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS provider_used TEXT;

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT FALSE;
