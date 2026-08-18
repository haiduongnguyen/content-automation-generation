import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImagePrompt,
  generatePostImages,
  pickDailyImageRole,
  shouldContinueAfterImageFailure,
} from "../src/services/postImageGenerator";

test("buildImagePrompt for practical example includes practical intent", () => {
  const prompt = buildImagePrompt({
    role: "practical_example",
    topicName: "Nhan ma tran",
    postContent: "Nhan ma tran trong AI\nVi du: tinh diem de xep hang noi dung.",
  });
  assert.match(prompt, /standalone square educational illustration/i);
  assert.match(prompt, /light warm background/i);
  assert.match(prompt, /concrete real-world scene/i);
  assert.match(prompt, /Strict no-text rule/i);
  assert.match(prompt, /Nhan ma tran/);
  assert.doesNotMatch(prompt, /512x512/);
});

test("buildImagePrompt for formula role includes AI workflow intent", () => {
  const prompt = buildImagePrompt({
    role: "formula_ai_application",
    topicName: "Dao ham",
    postContent: "Dao ham va gradient descent\nw = w - lr * grad",
  });
  assert.match(prompt, /mathematical idea to computation to AI outcome/i);
  assert.match(prompt, /abstract technical diagram without text/i);
  assert.match(prompt, /No people, no classroom/i);
  assert.match(prompt, /no textual elements/i);
  assert.doesNotMatch(prompt, /512x512/);
});

test("pickDailyImageRole is stable for same date and returns valid role", () => {
  const a = pickDailyImageRole("2026-05-17");
  const b = pickDailyImageRole("2026-05-17");
  assert.equal(a, b);
  assert.ok(a === "practical_example" || a === "formula_ai_application");
});

test("generatePostImages returns no images and does not call fetch when disabled", async () => {
  const originalImageEnabled = process.env.IMAGE_GENERATION_ENABLED;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  process.env.IMAGE_GENERATION_ENABLED = "false";
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  try {
    const images = await generatePostImages({
      topicName: "Dao ham",
      postContent: "Dao ham trong gradient descent.",
      seedDate: "2026-06-16",
    });
    assert.deepEqual(images, []);
    assert.equal(fetchCalled, false);
  } finally {
    if (originalImageEnabled === undefined) {
      delete process.env.IMAGE_GENERATION_ENABLED;
    } else {
      process.env.IMAGE_GENERATION_ENABLED = originalImageEnabled;
    }
    globalThis.fetch = originalFetch;
  }
});

test("shouldContinueAfterImageFailure follows configured failure mode", () => {
  assert.equal(shouldContinueAfterImageFailure("continue_text_only"), true);
  assert.equal(shouldContinueAfterImageFailure("fail_job"), false);
});
