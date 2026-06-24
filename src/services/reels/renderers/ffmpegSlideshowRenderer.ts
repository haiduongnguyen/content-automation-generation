import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { runCommand } from "../ffmpeg";
import { buildAssCaptions } from "../reelCaptions";
import type { ReelRenderInput, ReelRenderResult } from "../types";
import type { MediaStorage } from "../storage/types";
import { applyMediaOwnership, ensureMediaDirectory } from "../storage/localMediaStorage";
import type { ReelRenderer } from "./types";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DURATION = 15;
const SCENE_DURATIONS = [4, 7, 4] as const;

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function buildVoiceoverArgs(audioPaths: string[], outputPath: string): string[] {
  const args = ["-y"];
  for (const audioPath of audioPaths) {
    args.push("-i", audioPath);
  }
  args.push(
    "-filter_complex",
    `[0:a]apad,atrim=0:${SCENE_DURATIONS[0]}[a0];[1:a]apad,atrim=0:${SCENE_DURATIONS[1]}[a1];[2:a]apad,atrim=0:${SCENE_DURATIONS[2]}[a2];[a0][a1][a2]concat=n=3:v=0:a=1[a]`,
    "-map",
    "[a]",
    "-t",
    String(DURATION),
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    outputPath
  );
  return args;
}

export function buildRenderArgs(params: {
  imagePath: string;
  voiceoverPath: string;
  captionsPath: string;
  outputPath: string;
}): string[] {
  const subtitles = escapeFilterPath(params.captionsPath);
  const filter = [
    `[0:v]split=2[bgsrc][fgsrc]`,
    `[bgsrc]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},boxblur=28:8[bg]`,
    `[fgsrc]scale=1000:1760:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,trim=duration=${DURATION},setpts=PTS-STARTPTS[video]`,
    `[video]subtitles='${subtitles}',format=yuv420p[outv]`,
  ].join(";");
  return [
    "-y",
    "-loop",
    "1",
    "-i",
    params.imagePath,
    "-i",
    params.voiceoverPath,
    "-filter_complex",
    filter,
    "-map",
    "[outv]",
    "-map",
    "1:a:0",
    "-t",
    String(DURATION),
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    params.outputPath,
  ];
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

export class FfmpegSlideshowRenderer implements ReelRenderer {
  readonly name = "ffmpeg_slideshow" as const;

  constructor(private readonly storage: MediaStorage) {}

  async render(input: ReelRenderInput): Promise<ReelRenderResult> {
    const imageScene = input.scenes.find((scene) => scene.assetKey);
    if (!imageScene?.assetKey) {
      throw new Error("FFmpeg slideshow renderer requires a scene asset.");
    }
    const imagePath = this.storage.resolve(imageScene.assetKey);
    const voiceoverPath = this.storage.resolve(input.voiceoverKey);
    const outputPath = this.storage.resolve(input.outputKey);
    const captionsKey = input.captionsKey ?? `reels/${input.reelId}/prototype/captions.ass`;
    const captionsPath = this.storage.resolve(captionsKey);
    await ensureMediaDirectory(path.dirname(outputPath));
    await ensureMediaDirectory(path.dirname(captionsPath));
    await fs.writeFile(
      captionsPath,
      buildAssCaptions(
        input.scenes.map((scene) => ({
          id: scene.id as "hook" | "insight" | "cta",
          targetSeconds: scene.durationSeconds,
          narration: scene.narration,
          caption: scene.caption,
        }))
      ),
      "utf8"
    );
    await applyMediaOwnership(captionsPath);
    await runCommand("ffmpeg", buildRenderArgs({ imagePath, voiceoverPath, captionsPath, outputPath }));
    await applyMediaOwnership(outputPath);
    const stat = await fs.stat(outputPath);
    return {
      method: this.name,
      videoKey: input.outputKey,
      durationSeconds: DURATION,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      fileSizeBytes: stat.size,
      sha256: await sha256(outputPath),
    };
  }
}
