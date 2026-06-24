import assert from "node:assert/strict";
import test from "node:test";
import { PUBLISH_MESSAGE_MAX_LENGTH, validatePublishMessage } from "../src/services/validation/publish";

test("validatePublishMessage rejects empty messages", () => {
  assert.throws(() => validatePublishMessage("   "), /cannot be empty/);
});

test("validatePublishMessage rejects too long messages", () => {
  assert.throws(() => validatePublishMessage("x".repeat(PUBLISH_MESSAGE_MAX_LENGTH + 1)), /too long/);
});

test("validatePublishMessage accepts practical messages", () => {
  assert.doesNotThrow(() => validatePublishMessage("A useful Facebook post"));
});
