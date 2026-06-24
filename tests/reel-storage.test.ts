import assert from "node:assert/strict";
import test from "node:test";
import { parseReelRenderMethod, resolveReelRenderer } from "../src/services/reels/renderers/registry";
import { resolveMediaPath } from "../src/services/reels/storage/localMediaStorage";
import type { ReelRenderer } from "../src/services/reels/renderers/types";

test("resolveMediaPath keeps Reel assets inside the configured root", () => {
  assert.equal(
    resolveMediaPath("reels/123/render/final.mp4", "/tmp/content-media"),
    "/tmp/content-media/reels/123/render/final.mp4"
  );
  assert.throws(() => resolveMediaPath("../outside.mp4", "/tmp/content-media"), /outside MEDIA_STORAGE_ROOT/);
});

test("parseReelRenderMethod defaults to ffmpeg slideshow", () => {
  assert.equal(parseReelRenderMethod(undefined), "ffmpeg_slideshow");
  assert.equal(parseReelRenderMethod("remotion"), "remotion");
  assert.throws(() => parseReelRenderMethod("unknown"), /Invalid REEL_RENDER_METHOD/);
});

test("resolveReelRenderer selects a registered renderer", () => {
  const renderer = { name: "ffmpeg_slideshow", render: async () => Promise.reject() } satisfies ReelRenderer;
  assert.equal(resolveReelRenderer([renderer], "ffmpeg_slideshow"), renderer);
  assert.throws(() => resolveReelRenderer([], "ffmpeg_slideshow"), /not registered/);
});
