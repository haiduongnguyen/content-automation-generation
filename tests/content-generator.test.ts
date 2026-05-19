import test from "node:test";
import assert from "node:assert/strict";
import { extractOutputText, parseGeneratedContent } from "../src/services/contentGenerator";

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
