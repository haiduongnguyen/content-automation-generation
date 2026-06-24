import assert from "node:assert/strict";
import test from "node:test";
import { redactSecrets, resolveArtifactPath } from "../src/services/artifacts";

test("resolveArtifactPath keeps files inside job artifact directory", () => {
  const resolved = resolveArtifactPath(123, "steps/generate_text.json");
  assert.match(resolved, /storage\/jobs\/123\/steps\/generate_text\.json$/);
  assert.throws(() => resolveArtifactPath(123, "../outside.json"), /outside/);
});

test("redactSecrets redacts sensitive keys recursively", () => {
  assert.deepEqual(
    redactSecrets({
      accessToken: "abc",
      nested: {
        SMTP_PASS: "secret",
        safe: "value",
      },
    }),
    {
      accessToken: "[REDACTED]",
      nested: {
        SMTP_PASS: "[REDACTED]",
        safe: "value",
      },
    }
  );
});
