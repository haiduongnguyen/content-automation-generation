import test from "node:test";
import assert from "node:assert/strict";
import { buildAttachedMediaPayload, shouldPublishToFacebook } from "../src/services/facebookPublish";

test("buildAttachedMediaPayload builds attached_media params", () => {
  const payload = buildAttachedMediaPayload(["111", "222"]);
  assert.equal(payload["attached_media[0]"], "{\"media_fbid\":\"111\"}");
  assert.equal(payload["attached_media[1]"], "{\"media_fbid\":\"222\"}");
});

test("shouldPublishToFacebook follows publish enabled flag", () => {
  assert.equal(shouldPublishToFacebook(true), true);
  assert.equal(shouldPublishToFacebook(false), false);
});
