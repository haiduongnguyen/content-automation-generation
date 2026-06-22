import assert from "node:assert/strict";
import test from "node:test";
import { selectProviderOperationKey } from "../src/services/providerOperations";

test("post operations do not create more Gemini calls after exhausting attempts", () => {
  assert.equal(
    selectProviderOperationKey({
      baseOperationKey: "post_text:1",
      operationType: "post_text",
      maxAttempts: 2,
      family: [{ operation_key: "post_text:1", attempt_count: 2 }],
    }),
    "post_text:1"
  );
});

test("quarterly operations can retry a failed batch without replacing completed siblings", () => {
  assert.equal(
    selectProviderOperationKey({
      baseOperationKey: "quarterly:batch",
      operationType: "quarterly_topic",
      maxAttempts: 2,
      family: [{ operation_key: "quarterly:batch", attempt_count: 2 }],
    }),
    "quarterly:batch:retry:1"
  );
});
