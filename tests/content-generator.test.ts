import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTextGenerationPrompts,
  extractOutputText,
  generatePostContent,
  parseGeneratedContent,
  selectTextPromptProfile,
  TEXT_PROMPT_PROFILES,
} from "../src/services/contentGenerator";

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

test("text generation prompts use one of three stronger Vietnamese profiles", () => {
  assert.equal(TEXT_PROMPT_PROFILES.length, 3);
  const prompts = buildTextGenerationPrompts("Gradient descent trong AI", "post_text:job:123:Gradient descent trong AI");

  assert.match(prompts.systemPrompt, /tiếng Việt có dấu/i);
  assert.match(prompts.systemPrompt, /PROMPT_PROFILE_ID:/);
  assert.match(prompts.systemPrompt, /câu đáng lưu lại/i);
  assert.match(prompts.userPrompt, /góc tiếp cận sắc nhất/i);
  assert.ok(TEXT_PROMPT_PROFILES.some((profile) => profile.id === prompts.profile.id));
});

test("text prompt profile selection is stable by seed and can vary by job", () => {
  const seed = "post_text:job:123:Gradient descent";
  assert.equal(selectTextPromptProfile(seed).id, selectTextPromptProfile(seed).id);

  const seen = new Set(Array.from({ length: 30 }, (_, idx) => selectTextPromptProfile(`post_text:job:${idx}:Gradient descent`).id));
  assert.ok(seen.size > 1);
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
