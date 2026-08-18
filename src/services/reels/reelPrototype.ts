import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "../../db/pool";
import { generateReelScript } from "./reelScript";
import {
  assertGoogleTtsCredentials,
  createGoogleTextToSpeechProvider,
} from "./providers/tts/googleTextToSpeechProvider";
import { probeDuration, runCommand } from "./ffmpeg";
import { applyMediaOwnership, ensureMediaDirectory, LocalMediaStorage } from "./storage/localMediaStorage";
import { FfmpegSlideshowRenderer, buildVoiceoverArgs } from "./renderers/ffmpegSlideshowRenderer";
import { validatePrototypeProbe, writeProbe } from "./reelMediaProbe";
import { validateReelRenderResult } from "./reelValidator";
import type { ReelScriptResult } from "./reelScriptGenerator";

type PrototypePost = {
  id: string;
  title: string | null;
  body: string;
  cta: string | null;
  hashtags: unknown;
  topic_name: string | null;
  image_b64: string | null;
  mime_type: string | null;
};

export type PrototypeResult = {
  status: "rendered";
  postId: number;
  videoKey: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  sizeBytes: number;
  sha256: string;
};

async function loadPost(postId: number): Promise<PrototypePost> {
  const result = await pool.query<PrototypePost>(
    `
    SELECT p.id::text, p.title, p.body, p.cta, p.hashtags,
           COALESCE(cp.topic, t.name, p.title) AS topic_name,
           pi.image_b64, pi.mime_type
    FROM posts p
    JOIN content_jobs cj ON cj.id = p.job_id
    LEFT JOIN topics t ON t.id = p.topic_id
    LEFT JOIN content_plan cp ON cp.plan_date = cj.run_date AND cp.scheduled_slot = cj.scheduled_slot
    LEFT JOIN LATERAL (
      SELECT image_b64, mime_type
      FROM post_images
      WHERE post_id = p.id
      ORDER BY id ASC
      LIMIT 1
    ) pi ON TRUE
    WHERE p.id = $1
    LIMIT 1
    `,
    [postId]
  );
  const post = result.rows[0];
  if (!post) throw new Error(`Post not found: ${postId}`);
  return post;
}

function buildFallbackSourceArgs(outputPath: string): string[] {
  return [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x111827:s=1080x1920",
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outputPath,
  ];
}

async function writeSourceImage(post: PrototypePost, sourcePath: string): Promise<{ sourceKind: "post_image" | "fallback"; sourceMimeType: string }> {
  await ensureMediaDirectory(path.dirname(sourcePath));
  if (post.image_b64) {
    await fs.writeFile(sourcePath, Buffer.from(post.image_b64, "base64"));
    await applyMediaOwnership(sourcePath);
    return { sourceKind: "post_image", sourceMimeType: post.mime_type || "image/jpeg" };
  }

  await runCommand("ffmpeg", buildFallbackSourceArgs(sourcePath));
  await applyMediaOwnership(sourcePath);
  return { sourceKind: "fallback", sourceMimeType: "image/jpeg" };
}

function sceneAudioKey(postId: number, index: number, id: string): string {
  return `reels/${postId}/prototype/audio/${String(index + 1).padStart(2, "0")}-${id}.mp3`;
}

async function synthesizeScenes(postId: number, script: ReelScriptResult, storage: LocalMediaStorage) {
  const provider = createGoogleTextToSpeechProvider();
  const results: Array<{ key: string; path: string; duration: number }> = [];
  for (let index = 0; index < script.scenes.length; index += 1) {
    const scene = script.scenes[index]!;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const generated = await provider.synthesize({ text: scene.narration, language: "vi" });
        const key = sceneAudioKey(postId, index, scene.id);
        const outputPath = storage.resolve(key);
        await ensureMediaDirectory(path.dirname(outputPath));
        await fs.writeFile(outputPath, generated.audio);
        await applyMediaOwnership(outputPath);
        results.push({ key, path: outputPath, duration: await probeDuration(outputPath) });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;
  }
  return results;
}

function audioFits(script: ReelScriptResult, audio: Array<{ duration: number }>): boolean {
  const total = audio.reduce((sum, item) => sum + item.duration, 0);
  return total <= 14.5 && audio.every((item, index) => item.duration <= (script.scenes[index]?.targetSeconds ?? 0) - 0.08);
}

function buildFallbackReelScript(input: {
  title: string;
  topic: string;
}): ReelScriptResult {
  const title = input.title.trim() || input.topic.trim() || "Tóm tắt bài viết hôm nay";
  const scenes: ReelScriptResult["scenes"] = [
    {
      id: "hook",
      targetSeconds: 4,
      narration: "Bạn có biết ý chính của bài hôm nay là gì?",
      caption: "BẠN CÓ BIẾT?",
    },
    {
      id: "insight",
      targetSeconds: 7,
      narration: "Bài viết giải thích khái niệm này bằng ví dụ đơn giản, để bạn hiểu cách AI suy nghĩ.",
      caption: "MỘT Ý CHÍNH\nDỄ HIỂU",
    },
    {
      id: "cta",
      targetSeconds: 4,
      narration: "Xem bài đầy đủ để nắm rõ hơn nhé.",
      caption: "XEM BÀI VIẾT ĐẦY ĐỦ",
    },
  ];
  return {
    title,
    hook: scenes[0]!.narration,
    narration: scenes.map((scene) => scene.narration).join(" "),
    callToAction: scenes[2]!.narration,
    scenes,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateReelScriptWithBackoff(
  input: Parameters<typeof generateReelScript>[0],
  shortened = false
): Promise<ReelScriptResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await generateReelScript(input, shortened);
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        await sleep(5000 * attempt);
      }
    }
  }
  throw lastError;
}

export async function runReelPrototype(postId: number): Promise<PrototypeResult> {
  const storage = new LocalMediaStorage();
  const post = await loadPost(postId);
  assertGoogleTtsCredentials();
  const baseKey = `reels/${postId}/prototype`;
  const sourceKey = `${baseKey}/source.jpg`;
  const sourcePath = storage.resolve(sourceKey);
  const source = await writeSourceImage(post, sourcePath);

  const scriptInput = {
    topic: post.topic_name || post.title || "Facebook education post",
    postTitle: post.title || "",
    postBody: [post.body, post.cta].filter(Boolean).join("\n\n"),
    targetDurationSeconds: Number(process.env.REEL_TARGET_DURATION_SECONDS || "15"),
    language: "vi" as const,
  };

  let script = await generateReelScriptWithBackoff(scriptInput);
  let audio = await synthesizeScenes(postId, script, storage);
  if (!audioFits(script, audio)) {
    script = await generateReelScriptWithBackoff(scriptInput, true);
    audio = await synthesizeScenes(postId, script, storage);
  }
  if (!audioFits(script, audio)) {
    script = buildFallbackReelScript({
      title: post.title || "",
      topic: post.topic_name || "",
    });
    audio = await synthesizeScenes(postId, script, storage);
  }
  if (!audioFits(script, audio)) {
    throw new Error("Reel voiceover does not fit the 15-second scene timeline after Gemini shortening and local fallback.");
  }

  await fs.writeFile(storage.resolve(`${baseKey}/script.json`), `${JSON.stringify(script, null, 2)}\n`, "utf8");
  await applyMediaOwnership(storage.resolve(`${baseKey}/script.json`));
  const voiceoverKey = `${baseKey}/audio/voiceover.mp3`;
  const voiceoverPath = storage.resolve(voiceoverKey);
  await runCommand("ffmpeg", buildVoiceoverArgs(audio.map((item) => item.path), voiceoverPath));
  await applyMediaOwnership(voiceoverPath);

  const scenes = script.scenes.map((scene) => ({
    id: scene.id,
    type: scene.id,
    durationSeconds: scene.targetSeconds,
    narration: scene.narration,
    caption: scene.caption,
    assetKey: sourceKey,
  }));
  const videoKey = `${baseKey}/render/final.mp4`;
  const rendered = await new FfmpegSlideshowRenderer(storage).render({
    reelId: postId,
    title: script.title,
    script: script.narration,
    scenes,
    voiceoverKey,
    captionsKey: `${baseKey}/captions.ass`,
    outputKey: videoKey,
  });

  const videoPath = storage.resolve(videoKey);
  const probe = await writeProbe(videoPath, storage.resolve(`${baseKey}/ffprobe.json`));
  await applyMediaOwnership(storage.resolve(`${baseKey}/ffprobe.json`));
  const verified = validatePrototypeProbe(probe);
  validateReelRenderResult({ ...rendered, ...verified });

  await fs.writeFile(
    storage.resolve(`${baseKey}/metadata.json`),
    `${JSON.stringify(
      {
        status: "rendered",
        postId,
        videoKey,
        renderMethod: rendered.method,
        ttsProvider: "google",
        sourceKind: source.sourceKind,
        sourceMimeType: source.sourceMimeType,
        sceneAudio: audio.map((item, index) => ({
          sceneId: script.scenes[index]?.id,
          audioKey: item.key,
          durationSeconds: item.duration,
        })),
        ...verified,
        sha256: rendered.sha256,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await applyMediaOwnership(storage.resolve(`${baseKey}/metadata.json`));

  return {
    status: "rendered",
    postId,
    videoKey,
    durationSeconds: verified.durationSeconds,
    width: verified.width,
    height: verified.height,
    fps: verified.fps,
    sizeBytes: verified.fileSizeBytes,
    sha256: rendered.sha256,
  };
}
