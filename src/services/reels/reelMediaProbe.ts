import fs from "node:fs/promises";
import { runCommand } from "./ffmpeg";
import type { ReelRenderResult } from "./types";

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  avg_frame_rate?: string;
};

export type ReelProbe = {
  streams?: ProbeStream[];
  format?: {
    duration?: string;
    size?: string;
  };
};

function frameRate(value: string | undefined): number {
  if (!value) return 0;
  const [numerator, denominator] = value.split("/").map(Number);
  if (!numerator || !denominator) return 0;
  return numerator / denominator;
}

export async function probeMedia(filePath: string): Promise<ReelProbe> {
  const result = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    filePath,
  ]);
  return JSON.parse(result.stdout) as ReelProbe;
}

export function validatePrototypeProbe(probe: ReelProbe): Omit<ReelRenderResult, "method" | "videoKey" | "sha256"> {
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration);
  const size = Number(probe.format?.size);
  const fps = frameRate(video?.avg_frame_rate);
  if (!video || !audio) throw new Error("Reel must contain video and audio streams.");
  if (video.width !== 1080 || video.height !== 1920) throw new Error("Reel must be 1080x1920.");
  if (video.codec_name !== "h264" || video.pix_fmt !== "yuv420p") throw new Error("Reel video must be H.264 yuv420p.");
  if (audio.codec_name !== "aac") throw new Error("Reel audio must use AAC.");
  if (duration < 14.9 || duration > 15.1) throw new Error(`Reel duration must be 14.9-15.1 seconds; received ${duration}.`);
  if (Math.abs(fps - 30) > 0.01) throw new Error(`Reel frame rate must be 30 FPS; received ${fps}.`);
  if (!Number.isFinite(size) || size <= 0) throw new Error("Reel file is empty.");
  return {
    durationSeconds: duration,
    width: video.width,
    height: video.height,
    fps,
    fileSizeBytes: size,
  };
}

export async function writeProbe(filePath: string, outputPath: string): Promise<ReelProbe> {
  const probe = await probeMedia(filePath);
  await fs.writeFile(outputPath, `${JSON.stringify(probe, null, 2)}\n`, "utf8");
  return probe;
}
