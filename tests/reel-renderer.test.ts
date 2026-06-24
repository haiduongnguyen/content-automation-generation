import assert from "node:assert/strict";
import test from "node:test";
import { buildAssCaptions } from "../src/services/reels/reelCaptions";
import { buildRenderArgs, buildVoiceoverArgs } from "../src/services/reels/renderers/ffmpegSlideshowRenderer";
import { validatePrototypeProbe } from "../src/services/reels/reelMediaProbe";

test("FFmpeg commands are represented as argument arrays", () => {
  const voiceArgs = buildVoiceoverArgs(["a.mp3", "b.mp3", "c.mp3"], "voice.mp3");
  assert.deepEqual(voiceArgs.slice(0, 7), ["-y", "-i", "a.mp3", "-i", "b.mp3", "-i", "c.mp3"]);
  const renderArgs = buildRenderArgs({
    imagePath: "source.jpg",
    voiceoverPath: "voice.mp3",
    captionsPath: "captions.ass",
    outputPath: "final.mp4",
  });
  assert.equal(renderArgs.at(-1), "final.mp4");
  assert.ok(renderArgs.includes("libx264"));
  assert.ok(renderArgs.includes("yuv420p"));
});

test("FFmpeg render keeps the source image static without scene color overlays", () => {
  const renderArgs = buildRenderArgs({
    imagePath: "source.jpg",
    voiceoverPath: "voice.mp3",
    captionsPath: "captions.ass",
    outputPath: "final.mp4",
  });
  const filter = renderArgs[renderArgs.indexOf("-filter_complex") + 1] ?? "";
  assert.doesNotMatch(filter, /zoompan/);
  assert.doesNotMatch(filter, /drawbox/);
  assert.match(filter, /subtitles=/);
});

test("ASS captions preserve three fixed timeline windows", () => {
  const ass = buildAssCaptions([
    { id: "hook", targetSeconds: 4, narration: "a", caption: "HOOK" },
    { id: "insight", targetSeconds: 7, narration: "b", caption: "INSIGHT" },
    { id: "cta", targetSeconds: 4, narration: "c", caption: "CTA" },
  ]);
  assert.match(ass, /0:00:00\.00,0:00:04\.00/);
  assert.match(ass, /0:00:04\.00,0:00:11\.00/);
  assert.match(ass, /0:00:11\.00,0:00:15\.00/);
});

test("probe validation rejects missing audio and accepts Facebook Reel output", () => {
  assert.throws(
    () => validatePrototypeProbe({ streams: [{ codec_type: "video" }], format: { duration: "15", size: "1" } }),
    /video and audio/
  );
  const result = validatePrototypeProbe({
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        width: 1080,
        height: 1920,
        pix_fmt: "yuv420p",
        avg_frame_rate: "30/1",
      },
      { codec_type: "audio", codec_name: "aac" },
    ],
    format: { duration: "15.000", size: "1234" },
  });
  assert.equal(result.fps, 30);
});
