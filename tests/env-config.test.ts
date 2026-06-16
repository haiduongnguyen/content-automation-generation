import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, loadDbConfig } from "../src/config/env";

const REQUIRED_ENV = {
  PGHOST: "localhost",
  PGPORT: "5432",
  PGDATABASE: "content_automation",
  PGUSER: "postgres",
  PGPASSWORD: "postgres",
  FB_GRAPH_VERSION: "v25.0",
  OPENAI_API_KEY: "test-openai-key",
  OPENAI_MODEL: "gpt-5-mini",
};

function withEnv(values: NodeJS.ProcessEnv, fn: () => void): void {
  const previous = { ...process.env };
  Object.assign(process.env, REQUIRED_ENV, values);
  try {
    fn();
  } finally {
    process.env = previous;
  }
}

test("loadConfig allows missing Facebook token when publishing is disabled", () => {
  withEnv({ PUBLISH_ENABLED: "false", FB_PAGE_ACCESS_TOKEN: "" }, () => {
    const cfg = loadConfig();
    assert.equal(cfg.publishEnabled, false);
    assert.equal(cfg.fbPageAccessToken, "");
  });
});

test("loadConfig requires Facebook token when publishing is enabled", () => {
  withEnv({ PUBLISH_ENABLED: "true", FB_PAGE_ACCESS_TOKEN: "" }, () => {
    assert.throws(() => loadConfig(), /Missing required env var: FB_PAGE_ACCESS_TOKEN/);
  });
});

test("loadDbConfig does not require API credentials", () => {
  withEnv({ OPENAI_API_KEY: "", FB_PAGE_ACCESS_TOKEN: "" }, () => {
    const cfg = loadDbConfig();
    assert.equal(cfg.pgDatabase, "content_automation");
  });
});
