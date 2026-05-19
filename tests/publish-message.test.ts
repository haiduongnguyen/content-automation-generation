import test from "node:test";
import assert from "node:assert/strict";
import { buildMessage } from "../src/services/publishMessage";

test("buildMessage joins body cta hashtags", () => {
  const msg = buildMessage({
    title: "Dao ham la gi?",
    body: "Body",
    cta: "CTA",
    hashtags: ["#a", "#b"],
  });
  assert.equal(msg, "**DAO HAM LA GI?**\n\nBody\n\nCTA\n\n#a #b");
});
