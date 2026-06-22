import assert from "node:assert/strict";
import test from "node:test";
import { createDisabledImageProvider } from "../src/services/providers/image/disabledImageProvider";
import { createGeminiImageProvider } from "../src/services/providers/image/geminiImageProvider";

test("disabled image provider returns empty output", async () => {
  const provider = createDisabledImageProvider();
  const result = await provider.generate({
    topicName: "Dao ham",
    postContent: "Dao ham trong gradient descent.",
    prompt: "image prompt",
    seedDate: "2026-06-16",
    role: "practical_example",
  });

  assert.equal(result.provider, "disabled");
  assert.deepEqual(result.output, []);
});

test("gemini image provider extracts inline image data", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: "aW1hZ2U=",
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 100,
          totalTokenCount: 120,
        },
      }),
    }) as Response) as typeof fetch;

  try {
    const provider = createGeminiImageProvider(
      {
        geminiApiKey: "test-key",
        geminiImageModel: "gemini-3.1-flash-image",
      } as never
    );
    const result = await provider.generate({
      topicName: "Dao ham",
      postContent: "Dao ham trong gradient descent.",
      prompt: "image prompt",
      seedDate: "2026-06-16",
      role: "practical_example",
    });

    assert.equal(result.provider, "gemini");
    assert.equal(result.output.length, 1);
    assert.equal(result.output[0]?.mimeType, "image/png");
    assert.equal(result.output[0]?.b64Data, "aW1hZ2U=");
    assert.equal((result.metadata?.usage as Record<string, unknown>)?.totalTokens, 120);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
