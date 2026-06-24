import test from "node:test";
import assert from "node:assert/strict";
import { extractOutputText, generatePostContent, parseGeneratedContent } from "../src/services/contentGenerator";

test("parseGeneratedContent parses valid JSON content", () => {
  const raw = JSON.stringify({
    title: "Tieu de",
    body: "Noi dung hop le",
    cta: "De lai binh luan",
    hashtags: ["#marketing", "#smallbiz"],
  });

  const parsed = parseGeneratedContent(raw);
  assert.equal(parsed.title, "Tieu de");
  assert.equal(parsed.body, "Noi dung hop le");
  assert.equal(parsed.cta, "De lai binh luan");
  assert.deepEqual(parsed.hashtags, ["#marketing", "#smallbiz"]);
});

test("parseGeneratedContent throws on invalid shape", () => {
  const raw = JSON.stringify({ title: "x", body: "y", cta: "z", hashtags: [] });
  assert.throws(() => parseGeneratedContent(raw), /hashtags/);
});

test("extractOutputText reads from output_text", () => {
  const out = extractOutputText({ output_text: "{\"title\":\"A\"}" });
  assert.equal(out, "{\"title\":\"A\"}");
});

test("extractOutputText falls back to output content array", () => {
  const out = extractOutputText({
    output: [
      {
        content: [
          { type: "output_text", text: "{\"title\":\"A\",\"body\":\"B\",\"cta\":\"C\",\"hashtags\":[\"#x\"]}" },
        ],
      },
    ],
  });
  assert.match(out, /"title":"A"/);
});

test("generatePostContent uses Gemini before OpenAI when Gemini returns valid JSON", async () => {
  const previousEnv = { ...process.env };
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];

  Object.assign(process.env, {
    PGHOST: "localhost",
    PGPORT: "5432",
    PGDATABASE: "content_automation",
    PGUSER: "postgres",
    PGPASSWORD: "postgres",
    FB_GRAPH_VERSION: "v25.0",
    FB_PAGE_ACCESS_TOKEN: "",
    PUBLISH_ENABLED: "false",
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL: "gpt-5-mini",
    GEMINI_API: "test-gemini-key",
    GEMINI_MODEL: "gemini-2.5-flash",
  });

  globalThis.fetch = (async (url: string | URL | Request) => {
    const urlText = String(url);
    calls.push(urlText);
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: "Gemini title",
                    body: "Gemini body",
                    cta: "Gemini cta",
                    hashtags: ["#ai"],
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const result = await generatePostContent("Topic test");
    assert.equal(result.providerUsed, "gemini");
    assert.equal(result.fallbackUsed, false);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /generativelanguage\.googleapis\.com/);
  } finally {
    process.env = previousEnv;
    globalThis.fetch = previousFetch;
  }
});
