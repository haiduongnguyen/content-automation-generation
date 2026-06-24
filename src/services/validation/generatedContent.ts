import type { GeneratedContent } from "../contentGenerator";

export const GENERATED_CONTENT_LIMITS = {
  titleMaxLength: 180,
  bodyMaxLength: 9000,
  ctaMaxLength: 500,
  hashtagsMinCount: 1,
  hashtagsMaxCount: 7,
  hashtagMaxLength: 64,
};

export function validateGeneratedContentObject(obj: Record<string, unknown>): GeneratedContent {
  if (typeof obj.title !== "string" || obj.title.trim() === "") {
    throw new Error("Model output missing valid title.");
  }
  if (typeof obj.body !== "string" || obj.body.trim() === "") {
    throw new Error("Model output missing valid body.");
  }
  if (typeof obj.cta !== "string" || obj.cta.trim() === "") {
    throw new Error("Model output missing valid cta.");
  }
  if (!Array.isArray(obj.hashtags)) {
    throw new Error("Model output missing valid hashtags array.");
  }

  const title = obj.title.trim();
  const body = obj.body.trim();
  const cta = obj.cta.trim();
  const hashtags = obj.hashtags.map((h) => String(h).trim()).filter((h) => h.length > 0);

  if (title.length > GENERATED_CONTENT_LIMITS.titleMaxLength) {
    throw new Error(`Model output title is too long. Max ${GENERATED_CONTENT_LIMITS.titleMaxLength} characters.`);
  }
  if (body.length > GENERATED_CONTENT_LIMITS.bodyMaxLength) {
    throw new Error(`Model output body is too long. Max ${GENERATED_CONTENT_LIMITS.bodyMaxLength} characters.`);
  }
  if (cta.length > GENERATED_CONTENT_LIMITS.ctaMaxLength) {
    throw new Error(`Model output cta is too long. Max ${GENERATED_CONTENT_LIMITS.ctaMaxLength} characters.`);
  }
  if (hashtags.length < GENERATED_CONTENT_LIMITS.hashtagsMinCount) {
    throw new Error("Model output hashtags cannot be empty.");
  }
  if (hashtags.length > GENERATED_CONTENT_LIMITS.hashtagsMaxCount) {
    throw new Error(`Model output has too many hashtags. Max ${GENERATED_CONTENT_LIMITS.hashtagsMaxCount}.`);
  }
  for (const hashtag of hashtags) {
    if (hashtag.length > GENERATED_CONTENT_LIMITS.hashtagMaxLength) {
      throw new Error(`Model output hashtag is too long. Max ${GENERATED_CONTENT_LIMITS.hashtagMaxLength} characters.`);
    }
  }

  return { title, body, cta, hashtags };
}
