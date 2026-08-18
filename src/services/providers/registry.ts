import { loadConfig, type AppConfig } from "../../config/env";
import type { ImageProvider, TextProvider } from "./types";
import { createDisabledImageProvider } from "./image/disabledImageProvider";
import { createGeminiFirstImageProvider } from "./image/geminiFirstImageProvider";
import { createGeminiImageProvider } from "./image/geminiImageProvider";
import { createGoogleImagenImageProvider } from "./image/googleImagenImageProvider";
import { createOpenAiImageProvider } from "./image/openAiImageProvider";
import { createQwenImageProvider } from "./image/qwenImageProvider";
import { createGeminiFirstTextProvider } from "./text/geminiFirstTextProvider";
import { createGeminiTextProvider } from "./text/geminiTextProvider";
import { createOpenAiCompatibleTextProvider } from "./text/openAiCompatibleTextProvider";
import { createOpenAiTextProvider } from "./text/openAiTextProvider";

export function resolveTextProvider(args: {
  config?: AppConfig;
  isValidJsonText: (raw: string) => boolean;
}): TextProvider {
  const cfg = args.config ?? loadConfig();
  if (cfg.textProvider === "openai") {
    return createOpenAiTextProvider(cfg);
  }
  if (cfg.textProvider === "gemini") {
    return createGeminiTextProvider(cfg);
  }
  if (cfg.textProvider === "openai_compatible") {
    return createOpenAiCompatibleTextProvider(cfg);
  }
  if (cfg.textProvider === "qwen") {
    return createOpenAiCompatibleTextProvider(cfg, {
      baseUrl: cfg.qwenBaseUrl,
      model: cfg.qwenModel,
      name: "qwen",
      apiKey: cfg.qwenApiKey,
    });
  }
  if (cfg.textProvider === "ollama") {
    return createOpenAiCompatibleTextProvider(cfg, {
      baseUrl: cfg.ollamaBaseUrl,
      model: cfg.ollamaModel,
      name: "ollama",
    });
  }
  return createGeminiFirstTextProvider(cfg, args.isValidJsonText);
}

export function resolveImageProvider(args: { config?: AppConfig } = {}): ImageProvider {
  const cfg = args.config ?? loadConfig();
  if (!cfg.imageGenerationEnabled || cfg.imageProvider === "disabled") {
    return createDisabledImageProvider();
  }
  if (cfg.imageProvider === "gemini") {
    return createGeminiImageProvider(cfg);
  }
  if (cfg.imageProvider === "google_imagen") {
    return createGoogleImagenImageProvider(cfg);
  }
  if (cfg.imageProvider === "qwen") {
    return createQwenImageProvider(cfg);
  }
  if (cfg.imageProvider === "gemini_first") {
    return createGeminiFirstImageProvider(cfg);
  }
  return createOpenAiImageProvider(cfg);
}
