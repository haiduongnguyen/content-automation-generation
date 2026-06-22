import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableHttpStatus, ProviderError, providerErrorToMetadata, withLatencyMetadata } from "../src/services/providers/errors";
import { extractGeminiText } from "../src/services/providers/text/geminiTextProvider";
import { extractOutputText } from "../src/services/providers/text/openAiTextProvider";

test("extractOutputText reads OpenAI responses output_text", () => {
  assert.equal(extractOutputText({ output_text: " hello " }), "hello");
});

test("extractOutputText reads OpenAI responses output content parts", () => {
  assert.equal(
    extractOutputText({
      output: [{ content: [{ type: "output_text", text: "hello" }] }],
    }),
    "hello"
  );
});

test("extractGeminiText reads first non-empty text part", () => {
  assert.equal(
    extractGeminiText({
      candidates: [{ content: { parts: [{ text: "" }, { text: " gemini output " }] } }],
    }),
    "gemini output"
  );
});

test("Gemini text provider requests JSON response MIME type", async () => {
  const previousFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const { createGeminiTextProvider } = await import("../src/services/providers/text/geminiTextProvider");
    const provider = createGeminiTextProvider(
      {
        geminiApiKey: "test-key",
        geminiModel: "gemini-2.5-flash",
      } as never
    );
    await provider.generate({
      topicName: "test",
      systemPrompt: "Return JSON.",
      userPrompt: "Generate.",
      responseFormat: "json",
    });

    assert.deepEqual(requestBody?.generationConfig, { responseMimeType: "application/json" });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Gemini text provider records usage metadata", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 4,
          totalTokenCount: 14,
          cachedContentTokenCount: 2,
        },
      }),
    }) as Response) as typeof fetch;
  try {
    const { createGeminiTextProvider } = await import("../src/services/providers/text/geminiTextProvider");
    const provider = createGeminiTextProvider(
      {
        geminiApiKey: "test-key",
        geminiModel: "gemini-2.5-flash",
        geminiOperationMaxAttempts: 2,
      } as never
    );
    const result = await provider.generate({
      topicName: "test",
      systemPrompt: "Return JSON.",
      userPrompt: "Generate.",
      responseFormat: "json",
    });
    assert.deepEqual(result.metadata?.usage, {
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
      cachedTokens: 2,
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("provider errors expose retryable metadata", () => {
  const error = new ProviderError({
    provider: "gemini",
    model: "gemini-2.5-flash",
    code: "http_error",
    message: "rate limited",
    retryable: true,
    statusCode: 429,
    latencyMs: 12,
  });

  assert.equal(isRetryableHttpStatus(429), true);
  assert.equal(isRetryableHttpStatus(401), false);
  assert.deepEqual(providerErrorToMetadata(error), {
    provider: "gemini",
    model: "gemini-2.5-flash",
    code: "http_error",
    retryable: true,
    statusCode: 429,
    latencyMs: 12,
    message: "rate limited",
  });
});

test("withLatencyMetadata adds latency without dropping existing metadata", () => {
  const startedAt = Date.now() - 5;
  const result = withLatencyMetadata(
    {
      provider: "openai",
      model: "gpt-5-mini",
      output: "ok",
      metadata: { fallbackUsed: false },
    },
    startedAt
  );

  assert.equal(result.metadata?.fallbackUsed, false);
  assert.equal(typeof result.metadata?.latencyMs, "number");
});
