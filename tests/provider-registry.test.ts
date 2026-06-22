import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config/env";
import { resolveImageProvider, resolveTextProvider } from "../src/services/providers/registry";

const REQUIRED_ENV = {
  PGHOST: "localhost",
  PGPORT: "5432",
  PGDATABASE: "content_automation",
  PGUSER: "postgres",
  PGPASSWORD: "postgres",
  FB_GRAPH_VERSION: "v25.0",
  OPENAI_API_KEY: "test-openai-key",
  OPENAI_MODEL: "gpt-5-mini",
  GEMINI_API: "test-gemini-key",
  PUBLISH_ENABLED: "false",
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

test("resolveTextProvider defaults to gemini_first", () => {
  withEnv({}, () => {
    const provider = resolveTextProvider({
      config: loadConfig(),
      isValidJsonText: () => true,
    });
    assert.equal(provider.name, "gemini_first");
  });
});

test("resolveTextProvider supports openai", () => {
  withEnv({ TEXT_PROVIDER: "openai" }, () => {
    const provider = resolveTextProvider({
      config: loadConfig(),
      isValidJsonText: () => true,
    });
    assert.equal(provider.name, "openai");
  });
});

test("resolveImageProvider returns disabled provider when image generation is disabled", () => {
  withEnv({ IMAGE_GENERATION_ENABLED: "false" }, () => {
    const provider = resolveImageProvider({ config: loadConfig() });
    assert.equal(provider.name, "disabled");
  });
});

test("resolveImageProvider supports explicit disabled image provider", () => {
  withEnv({ IMAGE_GENERATION_ENABLED: "true", IMAGE_PROVIDER: "disabled" }, () => {
    const provider = resolveImageProvider({ config: loadConfig() });
    assert.equal(provider.name, "disabled");
  });
});

test("resolveImageProvider defaults to gemini_first when enabled", () => {
  withEnv({ IMAGE_GENERATION_ENABLED: "true", GEMINI_API: "test-gemini-key" }, () => {
    const provider = resolveImageProvider({ config: loadConfig() });
    assert.equal(provider.name, "gemini_first");
  });
});

test("resolveImageProvider supports gemini image provider", () => {
  withEnv({ IMAGE_GENERATION_ENABLED: "true", IMAGE_PROVIDER: "gemini", GEMINI_API: "test-gemini-key" }, () => {
    const provider = resolveImageProvider({ config: loadConfig() });
    assert.equal(provider.name, "gemini");
  });
});
