import test from "node:test";
import assert from "node:assert/strict";
import { shouldResumeGenerateForExistingPost, shouldSkipGenerateForExistingPost } from "../src/services/postDuplicateGuard";

function existingPost(approvalStatus: string) {
  return {
    id: "58",
    job_id: "61",
    approval_status: approvalStatus,
    title: "Title",
    body: "Body",
    cta: "CTA",
    hashtags: ["#ai"],
    provider_used: "gemini",
    fallback_used: false,
    image_count: 0,
    created_at: "2026-06-16T10:10:50.990Z",
  };
}

test("approved existing posts skip generation", () => {
  assert.equal(shouldSkipGenerateForExistingPost(existingPost("auto_approved")), true);
  assert.equal(shouldResumeGenerateForExistingPost(existingPost("auto_approved")), false);
});

test("draft existing posts resume generation", () => {
  assert.equal(shouldSkipGenerateForExistingPost(existingPost("draft")), false);
  assert.equal(shouldResumeGenerateForExistingPost(existingPost("draft")), true);
});

test("shouldSkipGenerateForExistingPost allows generation when no post exists", () => {
  assert.equal(shouldSkipGenerateForExistingPost(null), false);
});
