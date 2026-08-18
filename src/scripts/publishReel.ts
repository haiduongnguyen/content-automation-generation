import fs from "node:fs/promises";
import { loadConfig } from "../config/env";
import { pool } from "../db/pool";
import { getRequiredArg, parsePositiveInt } from "./cliArgs";
import { LocalMediaStorage } from "../services/reels/storage/localMediaStorage";
import { publishFacebookReel } from "../services/reels/facebookReelPublisher";
import {
  getReelByPostId,
  markReelPublishFailed,
  markReelPublishSuccess,
  saveRenderedReel,
  startReelPublishAttempt,
} from "../services/reels/reelRepository";
import type { PrototypeResult } from "../services/reels/reelPrototype";

type PostRow = {
  id: string;
  title: string | null;
  body: string;
  cta: string | null;
  hashtags: unknown;
  platform_post_id: string | null;
};

type TargetRow = {
  id: string;
  page_id: string;
};

async function loadPrototypeResult(postId: number, storage: LocalMediaStorage): Promise<PrototypeResult> {
  const metadataPath = storage.resolve(`reels/${postId}/prototype/metadata.json`);
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8")) as Record<string, unknown>;
  return {
    status: "rendered",
    postId,
    videoKey: String(metadata.videoKey),
    durationSeconds: Number(metadata.durationSeconds),
    width: Number(metadata.width),
    height: Number(metadata.height),
    fps: Number(metadata.fps),
    sizeBytes: Number(metadata.fileSizeBytes),
    sha256: String(metadata.sha256),
  };
}

function normalizeHashtags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("#") ? item : `#${item}`));
}

export function buildFacebookPostUrl(platformPostId: string | null | undefined): string | null {
  if (!platformPostId) return null;
  const [pageId, postId] = platformPostId.split("_");
  if (!pageId || !postId) return `https://www.facebook.com/${platformPostId}`;
  return `https://www.facebook.com/${pageId}/posts/${postId}`;
}

export function buildReelDescription(post: Pick<PostRow, "title" | "hashtags" | "platform_post_id">): string {
  const parts = [
    post.title ? `Tóm tắt nhanh: ${post.title}` : "Tóm tắt nhanh từ bài viết hôm nay.",
    buildFacebookPostUrl(post.platform_post_id) ? `Xem bài viết đầy đủ: ${buildFacebookPostUrl(post.platform_post_id)}` : null,
    normalizeHashtags(post.hashtags).slice(0, 5).join(" "),
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.join("\n\n");
}

export async function runPublishReel(postId: number) {
  const cfg = loadConfig();
  if (!cfg.publishEnabled) throw new Error("PUBLISH_ENABLED is false.");
  const pageId = process.env.FB_PAGE_ID?.trim();
  if (!pageId) throw new Error("Missing FB_PAGE_ID.");

  const storage = new LocalMediaStorage();
  const existingReel = await getReelByPostId(postId);
  if (existingReel?.status === "published" && existingReel.platform_reel_id) {
    return {
      status: "already_published",
      postId,
      reelId: Number(existingReel.id),
      platformVideoId: existingReel.platform_reel_id,
      permalink: existingReel.platform_permalink,
    };
  }

  const rendered = await loadPrototypeResult(postId, storage);
  let reel = await saveRenderedReel(postId, rendered, storage);
  if (reel.status === "published" && reel.platform_reel_id) {
    return {
      status: "already_published",
      postId,
      reelId: Number(reel.id),
      platformVideoId: reel.platform_reel_id,
      permalink: reel.platform_permalink,
    };
  }

  const postResult = await pool.query<PostRow>(
    `
    SELECT p.id::text, p.title, p.body, p.cta, p.hashtags,
           pa.platform_post_id
    FROM posts p
    LEFT JOIN LATERAL (
      SELECT platform_post_id
      FROM publish_attempts
      WHERE post_id = p.id
        AND status = 'success'
        AND platform_post_id IS NOT NULL
      ORDER BY published_at DESC NULLS LAST, id DESC
      LIMIT 1
    ) pa ON TRUE
    WHERE p.id = $1
    `,
    [postId]
  );
  const post = postResult.rows[0];
  if (!post) throw new Error(`Post not found: ${postId}`);
  const targetResult = await pool.query<TargetRow>(
    "SELECT id::text, page_id FROM publish_targets WHERE platform = 'facebook' AND page_id = $1 AND is_active = true",
    [pageId]
  );
  const target = targetResult.rows[0];
  if (!target) throw new Error(`Active Facebook publish target not found for page ${pageId}.`);

  const reelId = Number(reel.id);
  const attemptId = await startReelPublishAttempt(reelId, Number(target.id));
  let platformVideoId: string | null = null;
  try {
    const publishInput = {
      graphVersion: cfg.fbGraphVersion,
      pageId: target.page_id,
      accessToken: cfg.fbPageAccessToken,
      videoPath: storage.resolve(reel.video_key),
      description: buildReelDescription(post),
      ...(post.title ? { title: post.title } : {}),
    };
    const published = await publishFacebookReel(publishInput);
    platformVideoId = published.videoId;
    await markReelPublishSuccess({
      reelId,
      attemptId,
      platformVideoId,
      permalink: published.permalink,
      responsePayload: published,
    });
    return {
      status: "published",
      postId,
      reelId,
      platformVideoId,
      permalink: published.permalink,
      facebookStatus: published.statusResponse,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markReelPublishFailed({
      reelId,
      attemptId,
      platformVideoId,
      errorMessage: message,
      responsePayload: { error: message },
    });
    throw err;
  }
}

async function main(): Promise<void> {
  const postId = parsePositiveInt(getRequiredArg("--post-id"), "--post-id");
  console.log(JSON.stringify(await runPublishReel(postId), null, 2));
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("reels:publish failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
