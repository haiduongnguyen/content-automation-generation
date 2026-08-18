import assert from "node:assert/strict";
import test from "node:test";
import { createDisabledImageProvider } from "../src/services/providers/image/disabledImageProvider";
import { createGeminiImageProvider } from "../src/services/providers/image/geminiImageProvider";
import { createGoogleImagenImageProvider } from "../src/services/providers/image/googleImagenImageProvider";
import { createQwenImageProvider } from "../src/services/providers/image/qwenImageProvider";

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

test("Google Imagen provider extracts base64 image data", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        predictions: [
          {
            bytesBase64Encoded: "aW1hZ2U=",
            mimeType: "image/png",
          },
        ],
      }),
    }) as Response) as typeof fetch;

  try {
    const provider = createGoogleImagenImageProvider(
      {
        geminiApiKey: "test-key",
        geminiImageApiKey: "test-image-key",
        googleImagenModel: "imagen-4.0-fast-generate-001",
        geminiOperationMaxAttempts: 2,
      } as never
    );
    const result = await provider.generate({
      topicName: "Dao ham",
      postContent: "Dao ham trong gradient descent.",
      prompt: "image prompt",
      seedDate: "2026-06-16",
      role: "practical_example",
    });

    assert.equal(result.provider, "google_imagen");
    assert.equal(result.output.length, 1);
    assert.equal(result.output[0]?.mimeType, "image/png");
    assert.equal(result.output[0]?.b64Data, "aW1hZ2U=");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Qwen image provider downloads returned image URL", async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/api/v1/services/aigc/multimodal-generation/generation")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        parameters?: { prompt_extend?: boolean; negative_prompt?: string; size?: string };
      };
      assert.equal(body.parameters?.size, "1328*1328");
      assert.equal(body.parameters?.prompt_extend, false);
      assert.match(body.parameters?.negative_prompt ?? "", /text/);
      return {
        ok: true,
        json: async () => ({
          output: {
            choices: [
              {
                message: {
                  content: [{ image: "https://example.test/generated.png" }],
                },
              },
            ],
          },
          usage: {
            output_width: 512,
            output_height: 512,
            output_image_count: 1,
          },
          request_id: "request-1",
        }),
      } as Response;
    }
    return {
      ok: true,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => Buffer.from("image"),
    } as Response;
  }) as typeof fetch;

  try {
    const provider = createQwenImageProvider(
      {
        qwenApiKey: "test-qwen-key",
        qwenImageModel: "qwen-image",
        qwenImageBaseUrl: "https://workspace.ap-southeast-1.maas.aliyuncs.com",
        imageOutputSize: "512x512",
        geminiOperationMaxAttempts: 2,
      } as never
    );
    const result = await provider.generate({
      topicName: "Dao ham",
      postContent: "Dao ham trong gradient descent.",
      prompt: "image prompt",
      seedDate: "2026-06-16",
      role: "practical_example",
    });

    assert.equal(result.provider, "qwen");
    assert.equal(result.output.length, 1);
    assert.equal(result.output[0]?.mimeType, "image/png");
    assert.equal(result.output[0]?.b64Data, "aW1hZ2U=");
    assert.equal(calls.length, 2);
    assert.match(calls[0] ?? "", /multimodal-generation/);
    assert.equal(calls[1], "https://example.test/generated.png");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
