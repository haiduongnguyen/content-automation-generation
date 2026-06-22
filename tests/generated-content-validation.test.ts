import assert from "node:assert/strict";
import test from "node:test";
import { validateGeneratedContentObject } from "../src/services/validation/generatedContent";

test("validateGeneratedContentObject trims valid generated content", () => {
  assert.deepEqual(
    validateGeneratedContentObject({
      title: " Title ",
      body: " Body ",
      cta: " CTA ",
      hashtags: [" #ai ", ""],
    }),
    {
      title: "Title",
      body: "Body",
      cta: "CTA",
      hashtags: ["#ai"],
    }
  );
});

test("validateGeneratedContentObject rejects too many hashtags", () => {
  assert.throws(
    () =>
      validateGeneratedContentObject({
        title: "Title",
        body: "Body",
        cta: "CTA",
        hashtags: ["#1", "#2", "#3", "#4", "#5", "#6", "#7", "#8"],
      }),
    /too many hashtags/
  );
});
