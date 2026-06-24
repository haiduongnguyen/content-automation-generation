import type { ReelRenderResult } from "./types";

export const FACEBOOK_REEL_SPEC = {
  width: 1080,
  height: 1920,
  minDurationSeconds: 3,
  maxDurationSeconds: 90,
  minFps: 24,
  maxFps: 60,
} as const;

export function validateReelRenderResult(result: ReelRenderResult): void {
  if (result.width !== FACEBOOK_REEL_SPEC.width || result.height !== FACEBOOK_REEL_SPEC.height) {
    throw new Error(`Reel must be ${FACEBOOK_REEL_SPEC.width}x${FACEBOOK_REEL_SPEC.height}.`);
  }
  if (
    result.durationSeconds < FACEBOOK_REEL_SPEC.minDurationSeconds ||
    result.durationSeconds > FACEBOOK_REEL_SPEC.maxDurationSeconds
  ) {
    throw new Error("Reel duration must be between 3 and 90 seconds.");
  }
  if (result.fps < FACEBOOK_REEL_SPEC.minFps || result.fps > FACEBOOK_REEL_SPEC.maxFps) {
    throw new Error("Reel frame rate must be between 24 and 60 FPS.");
  }
  if (result.fileSizeBytes <= 0 || !result.sha256) {
    throw new Error("Reel output metadata is incomplete.");
  }
}
