import { loadConfig } from "../config/env";
import { pool } from "../db/pool";
import { queryManyFromFile, queryOneFromFile } from "../db/sqlRunner";
import { buildAttachedMediaPayload, shouldPublishToFacebook } from "../services/facebookPublish";
import { buildMessage } from "../services/publishMessage";
import { validatePublishMessage } from "../services/validation/publish";

type ReadyPost = {
  id: string;
  job_id: string;
  title: string | null;
  body: string;
  cta: string | null;
  hashtags: unknown;
};

type Target = {
  id: string;
  page_id: string;
};

type PostImageRow = {
  id: string;
  image_role: string;
  mime_type: string;
  image_b64: string;
};

export type PublishOnceResult =
  | {
      status: "no_post";
      reason: string;
    }
  | {
      status: "skipped";
      reason: string;
      postId: string;
      targetId: string;
      imageCount: number;
    }
  | {
      status: "published";
      postId: string;
      targetId: string;
      platformPostId: string;
      imageCount: number;
    };

async function uploadUnpublishedPhoto(params: {
  pageId: string;
  graphVersion: string;
  accessToken: string;
  imageB64: string;
  mimeType: string;
}): Promise<string> {
  const url = `https://graph.facebook.com/${params.graphVersion}/${params.pageId}/photos`;
  const form = new FormData();
  form.set("published", "false");
  form.set("access_token", params.accessToken);
  form.set("source", new Blob([Buffer.from(params.imageB64, "base64")], { type: params.mimeType }), "post-image.png");

  const resp = await fetch(url, { method: "POST", body: form });
  const payload = await resp.json();
  if (!resp.ok || !payload?.id) {
    const errorMessage = payload?.error?.message ? String(payload.error.message) : `HTTP ${resp.status}`;
    throw new Error(`Upload photo failed: ${errorMessage}`);
  }

  return String(payload.id);
}

export async function runPublishOnce(options: { postId?: number } = {}): Promise<PublishOnceResult> {
  const cfg = loadConfig();
  const posts = options.postId
    ? await queryManyFromFile<ReadyPost>("037_get_post_ready_to_publish_by_id.sql", { post_id: options.postId })
    : await queryManyFromFile<ReadyPost>("006_get_posts_ready_to_publish.sql");
  if (posts.length === 0) {
    const reason = options.postId ? `Post ${options.postId} is not ready to publish.` : "No approved posts ready to publish.";
    console.log(reason);
    return { status: "no_post", reason };
  }

  const post = posts[0];
  if (!post) {
    const reason = options.postId ? `Post ${options.postId} is not ready to publish.` : "No approved posts ready to publish.";
    console.log(reason);
    return { status: "no_post", reason };
  }
  const target = await queryOneFromFile<Target>("007_get_active_publish_target.sql", { platform: "facebook" });
  const postImages = await queryManyFromFile<PostImageRow>("020_get_post_images.sql", { post_id: Number(post.id) });

  const url = `https://graph.facebook.com/${cfg.fbGraphVersion}/${target.page_id}/feed`;
  const message = buildMessage(post);
  validatePublishMessage(message);
  const bodyParams: Record<string, string> = {
    message,
    access_token: cfg.fbPageAccessToken,
  };

  if (!shouldPublishToFacebook(cfg.publishEnabled)) {
    const result: PublishOnceResult = {
      status: "skipped",
      reason: "PUBLISH_ENABLED is false",
      postId: post.id,
      targetId: target.id,
      imageCount: postImages.length,
    };
    console.log(JSON.stringify({ ...result, skipped: true }, null, 2));
    return result;
  }

  if (postImages.length > 0) {
    const mediaFbIds: string[] = [];
    for (const image of postImages) {
      const mediaFbId = await uploadUnpublishedPhoto({
        pageId: target.page_id,
        graphVersion: cfg.fbGraphVersion,
        accessToken: cfg.fbPageAccessToken,
        imageB64: image.image_b64,
        mimeType: image.mime_type || "image/png",
      });
      mediaFbIds.push(mediaFbId);
    }
    Object.assign(bodyParams, buildAttachedMediaPayload(mediaFbIds));
  }

  const resp = await fetch(url, { method: "POST", body: new URLSearchParams(bodyParams) });
  const payload = await resp.json();

  if (!resp.ok || !payload?.id) {
    const errorMessage = payload?.error?.message ? String(payload.error.message) : `HTTP ${resp.status}`;
    await queryOneFromFile("009_log_publish_failed.sql", {
      post_id: Number(post.id),
      target_id: Number(target.id),
      error_message: errorMessage,
      response_payload_json: JSON.stringify(payload),
    });
    await queryOneFromFile("011_mark_job_failed.sql", {
      job_id: Number(post.job_id),
      error_message: errorMessage,
    });
    throw new Error(`Publish failed: ${errorMessage}`);
  }

  await queryOneFromFile("008_log_publish_success.sql", {
    post_id: Number(post.id),
    target_id: Number(target.id),
    platform_post_id: String(payload.id),
    response_payload_json: JSON.stringify(payload),
  });

  await queryOneFromFile("010_mark_job_posted.sql", { job_id: Number(post.job_id) });

  const result: PublishOnceResult = {
    status: "published",
    postId: post.id,
    targetId: target.id,
    platformPostId: String(payload.id),
    imageCount: postImages.length,
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  runPublishOnce()
    .catch((err) => {
      console.error("publish:once failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
