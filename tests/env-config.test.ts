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
  GEMINI_API: "test-gemini-key",
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

test("loadConfig allows missing OpenAI credentials for Gemini-only generation", () => {
  withEnv(
    {
      OPENAI_API_KEY: "",
      OPENAI_MODEL: "",
      GEMINI_API: "test-gemini-key",
      TEXT_PROVIDER: "gemini",
      TEXT_FALLBACK_PROVIDER: "none",
      IMAGE_GENERATION_ENABLED: "true",
      IMAGE_PROVIDER: "gemini",
      IMAGE_FALLBACK_PROVIDER: "none",
      PUBLISH_ENABLED: "false",
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.openAiApiKey, "");
      assert.equal(cfg.openAiModel, "gpt-5-mini");
      assert.equal(cfg.textProvider, "gemini");
      assert.equal(cfg.imageProvider, "gemini");
    }
  );
});

test("loadConfig supports a separate Gemini image key", () => {
  withEnv(
    {
      GEMINI_API: "test-text-key",
      GEMINI_IMAGE_API: "test-image-key",
      TEXT_PROVIDER: "gemini",
      TEXT_FALLBACK_PROVIDER: "none",
      IMAGE_GENERATION_ENABLED: "true",
      IMAGE_PROVIDER: "gemini",
      IMAGE_FALLBACK_PROVIDER: "none",
      PUBLISH_ENABLED: "false",
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.geminiApiKey, "test-text-key");
      assert.equal(cfg.geminiImageApiKey, "test-image-key");
    }
  );
});

test("loadConfig can use Gemini image key without Gemini text key", () => {
  withEnv(
    {
      GEMINI_API: "",
      GEMINI_API_KEY: "",
      GEMINI_IMAGE_API: "test-image-key",
      TEXT_PROVIDER: "openai",
      IMAGE_GENERATION_ENABLED: "true",
      IMAGE_PROVIDER: "gemini",
      IMAGE_FALLBACK_PROVIDER: "none",
      TOPIC_MODE: "manual_only",
      PUBLISH_ENABLED: "false",
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.geminiApiKey, "");
      assert.equal(cfg.geminiImageApiKey, "test-image-key");
    }
  );
});

test("loadConfig supports Google Imagen provider with Gemini image key", () => {
  withEnv(
    {
      GEMINI_API: "",
      GEMINI_API_KEY: "",
      GEMINI_IMAGE_API: "test-image-key",
      TEXT_PROVIDER: "openai",
      IMAGE_GENERATION_ENABLED: "true",
      IMAGE_PROVIDER: "google_imagen",
      IMAGE_FALLBACK_PROVIDER: "none",
      TOPIC_MODE: "manual_only",
      PUBLISH_ENABLED: "false",
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.imageProvider, "google_imagen");
      assert.equal(cfg.googleImagenModel, "imagen-4.0-fast-generate-001");
      assert.equal(cfg.geminiImageApiKey, "test-image-key");
    }
  );
});

test("loadConfig supports Qwen text and image providers", () => {
  withEnv(
    {
      OPENAI_API_KEY: "",
      GEMINI_API: "",
      GEMINI_API_KEY: "",
      QWEN_API_KEY: "test-qwen-key",
      QWEN_MODEL: "qwen-max",
      QWEN_IMAGE_MODEL: "qwen-image",
      QWEN_BASE_URL: "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      TEXT_PROVIDER: "qwen",
      TEXT_FALLBACK_PROVIDER: "none",
      IMAGE_GENERATION_ENABLED: "true",
      IMAGE_PROVIDER: "qwen",
      IMAGE_FALLBACK_PROVIDER: "none",
      TOPIC_MODE: "manual_only",
      PUBLISH_ENABLED: "false",
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.textProvider, "qwen");
      assert.equal(cfg.imageProvider, "qwen");
      assert.equal(cfg.qwenApiKey, "test-qwen-key");
      assert.equal(cfg.qwenModel, "qwen-max");
      assert.equal(cfg.qwenImageModel, "qwen-image");
      assert.equal(cfg.qwenImageBaseUrl, "https://workspace.ap-southeast-1.maas.aliyuncs.com");
    }
  );
});

test("loadConfig supports configurable image output size", () => {
  withEnv(
    {
      IMAGE_OUTPUT_SIZE: "512x512",
      IMAGE_GENERATION_ENABLED: "false",
      PUBLISH_ENABLED: "false",
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.imageOutputSize, "512x512");
    }
  );
});

test("loadConfig requires OpenAI credentials when OpenAI image fallback is enabled", () => {
  withEnv(
    {
      OPENAI_API_KEY: "",
      GEMINI_API: "test-gemini-key",
      TEXT_PROVIDER: "gemini",
      TEXT_FALLBACK_PROVIDER: "none",
      IMAGE_GENERATION_ENABLED: "true",
      IMAGE_PROVIDER: "gemini_first",
      IMAGE_FALLBACK_PROVIDER: "openai",
      PUBLISH_ENABLED: "false",
    },
    () => {
      assert.throws(() => loadConfig(), /Missing required env var: OPENAI_API_KEY/);
    }
  );
});

test("loadConfig requires Gemini credentials for Gemini-first generation", () => {
  withEnv(
    {
      GEMINI_API: "",
      GEMINI_API_KEY: "",
      TEXT_PROVIDER: "gemini_first",
      IMAGE_GENERATION_ENABLED: "true",
      IMAGE_PROVIDER: "gemini_first",
      PUBLISH_ENABLED: "false",
    },
    () => {
      assert.throws(() => loadConfig(), /Missing required env var: GEMINI_API/);
    }
  );
});
