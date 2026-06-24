import type { ReelRenderMethod } from "../types";
import type { ReelRenderer } from "./types";

export const DEFAULT_REEL_RENDER_METHOD: ReelRenderMethod = "ffmpeg_slideshow";

export function parseReelRenderMethod(value: string | undefined): ReelRenderMethod {
  const method = value?.trim() || DEFAULT_REEL_RENDER_METHOD;
  if (method === "ffmpeg_slideshow" || method === "remotion" || method === "hybrid_ai") {
    return method;
  }
  throw new Error(`Invalid REEL_RENDER_METHOD: ${method}`);
}

export function resolveReelRenderer(
  renderers: readonly ReelRenderer[],
  method = parseReelRenderMethod(process.env.REEL_RENDER_METHOD)
): ReelRenderer {
  const renderer = renderers.find((candidate) => candidate.name === method);
  if (!renderer) {
    throw new Error(`Reel renderer is not registered: ${method}`);
  }
  return renderer;
}
