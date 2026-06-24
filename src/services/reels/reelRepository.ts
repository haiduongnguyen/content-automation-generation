import fs from "node:fs/promises";
import { pool } from "../../db/pool";
import type { PrototypeResult } from "./reelPrototype";
import type { MediaStorage } from "./storage/types";

export type ReelRecord = {
  id: string;
  post_id: string;
  status: "rendered" | "uploading" | "published" | "failed";
  video_key: string;
  platform_reel_id: string | null;
  platform_permalink: string | null;
};

export async function saveRenderedReel(
  postId: number,
  result: PrototypeResult,
  storage: MediaStorage
): Promise<ReelRecord> {
  const metadataPath = storage.resolve(`reels/${postId}/prototype/metadata.json`);
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8")) as Record<string, unknown>;
  const saved = await pool.query<ReelRecord>(
    `
    INSERT INTO reels (
      post_id, render_method, status, video_key, duration_seconds,
      width, height, fps, file_size_bytes, sha256, metadata, error_message, updated_at
    )
    VALUES ($1, $2, 'rendered', $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NULL, NOW())
    ON CONFLICT (post_id)
    DO UPDATE SET
      render_method = EXCLUDED.render_method,
      status = CASE WHEN reels.status = 'published' THEN reels.status ELSE 'rendered' END,
      video_key = EXCLUDED.video_key,
      duration_seconds = EXCLUDED.duration_seconds,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      fps = EXCLUDED.fps,
      file_size_bytes = EXCLUDED.file_size_bytes,
      sha256 = EXCLUDED.sha256,
      metadata = EXCLUDED.metadata,
      error_message = CASE WHEN reels.status = 'published' THEN reels.error_message ELSE NULL END,
      updated_at = NOW()
    RETURNING id::text, post_id::text, status, video_key, platform_reel_id, platform_permalink
    `,
    [
      postId,
      String(metadata.renderMethod || "ffmpeg_slideshow"),
      result.videoKey,
      result.durationSeconds,
      result.width,
      result.height,
      result.fps,
      result.sizeBytes,
      result.sha256,
      JSON.stringify(metadata),
    ]
  );
  return saved.rows[0]!;
}

export async function getReelByPostId(postId: number): Promise<ReelRecord | null> {
  const result = await pool.query<ReelRecord>(
    `
    SELECT id::text, post_id::text, status, video_key, platform_reel_id, platform_permalink
    FROM reels
    WHERE post_id = $1
    `,
    [postId]
  );
  return result.rows[0] ?? null;
}

export async function startReelPublishAttempt(reelId: number, targetId: number): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `
    WITH next_attempt AS (
      SELECT COALESCE(MAX(attempt_no), 0) + 1 AS attempt_no
      FROM reel_publish_attempts
      WHERE reel_id = $1 AND target_id = $2
    )
    INSERT INTO reel_publish_attempts (reel_id, target_id, attempt_no, status)
    SELECT $1, $2, attempt_no, 'started'
    FROM next_attempt
    RETURNING id::text
    `,
    [reelId, targetId]
  );
  await pool.query(
    "UPDATE reels SET status = 'uploading', error_message = NULL, updated_at = NOW() WHERE id = $1",
    [reelId]
  );
  return Number(result.rows[0]!.id);
}

export async function markReelPublishSuccess(params: {
  reelId: number;
  attemptId: number;
  platformVideoId: string;
  permalink: string | null;
  responsePayload: unknown;
}): Promise<void> {
  await pool.query("BEGIN");
  try {
    await pool.query(
      `
      UPDATE reel_publish_attempts
      SET status = 'success', platform_video_id = $2, response_payload = $3::jsonb, completed_at = NOW()
      WHERE id = $1
      `,
      [params.attemptId, params.platformVideoId, JSON.stringify(params.responsePayload)]
    );
    await pool.query(
      `
      UPDATE reels
      SET status = 'published', platform_reel_id = $2, platform_permalink = $3,
          published_at = NOW(), error_message = NULL, updated_at = NOW()
      WHERE id = $1
      `,
      [params.reelId, params.platformVideoId, params.permalink]
    );
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

export async function markReelPublishFailed(params: {
  reelId: number;
  attemptId: number;
  platformVideoId: string | null;
  errorMessage: string;
  responsePayload: unknown;
}): Promise<void> {
  await pool.query("BEGIN");
  try {
    await pool.query(
      `
      UPDATE reel_publish_attempts
      SET status = 'failed', platform_video_id = $2, error_message = $3,
          response_payload = $4::jsonb, completed_at = NOW()
      WHERE id = $1
      `,
      [params.attemptId, params.platformVideoId, params.errorMessage, JSON.stringify(params.responsePayload)]
    );
    await pool.query(
      "UPDATE reels SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
      [params.reelId, params.errorMessage]
    );
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}
