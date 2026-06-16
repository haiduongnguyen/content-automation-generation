import test from "node:test";
import assert from "node:assert/strict";
import { shouldSkipGenerateForExistingPost } from "../src/services/postDuplicateGuard";

test("shouldSkipGenerateForExistingPost skips when a post exists", () => {
  assert.equal(
    shouldSkipGenerateForExistingPost({
      id: "58",
      job_id: "61",
      approval_status: "auto_approved",
      created_at: "2026-06-16T10:10:50.990Z",
    }),
    true
  );
});

test("shouldSkipGenerateForExistingPost allows generation when no post exists", () => {
  assert.equal(shouldSkipGenerateForExistingPost(null), false);
});
