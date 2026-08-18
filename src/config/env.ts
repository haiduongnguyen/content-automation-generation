import dotenv from "dotenv";
import { getVietnamDateString } from "../utils/dateTime";

dotenv.config();

export type AppConfig = {
  pgHost: string;
  pgPort: number;
  pgDatabase: string;
  pgUser: string;
  pgPassword: string;
  fbPageAccessToken: string;
  fbGraphVersion: string;
  openAiApiKey: string;
  openAiModel: string;
  promptVersion: string;
  openAiDailyMaxRequests: number;
  openAiDailyBudgetUsd: number;
  openAiEstimatedCostPerRequestUsd: number;
  autoApprove: boolean;
  planStartDate: string;
  reportEmailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  reportEmailFrom: string;
  reportEmailTo: string;
  fbAppId: string;
  fbAppSecret: string;
  geminiApiKey: string;
  geminiImageApiKey: string;
  geminiModel: string;
  geminiImageModel: string;
  googleImagenModel: string;
  qwenApiKey: string;
  qwenModel: string;
  qwenImageModel: string;
  qwenBaseUrl: string;
  qwenImageBaseUrl: string;
  textProvider: "gemini_first" | "gemini" | "openai" | "openai_compatible" | "ollama" | "qwen";
  textFallbackProvider: "openai" | "none";
  textOpenAiCompatibleBaseUrl: string;
  textOpenAiCompatibleModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  imageProvider: "gemini_first" | "gemini" | "google_imagen" | "qwen" | "openai" | "disabled";
  imageFallbackProvider: "openai" | "none";
  imageGenerationEnabled: boolean;
  imageOutputSize: string;
  imageFailureMode: "fail_job" | "continue_text_only";
  topicMode: "manual_only" | "auto_approve_generated";
  topicDuplicateLookbackDays: number;
  quarterlyTopicPlanEnabled: boolean;
  quarterlyTopicLeadDays: number;
  geminiOperationMaxAttempts: number;
  publishEnabled: boolean;
  reelsEnabled: boolean;
};

export type DbConfig = Pick<AppConfig, "pgHost" | "pgPort" | "pgDatabase" | "pgUser" | "pgPassword">;

function getRequired(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getGeminiApiKey(required: boolean): string {
  const value = process.env.GEMINI_API?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
  if (required && value === "") {
    throw new Error("Missing required env var: GEMINI_API");
  }
  return value;
}

function getGeminiImageApiKey(baseGeminiApiKey: string, required: boolean): string {
  const value = process.env.GEMINI_IMAGE_API?.trim() || process.env.GEMINI_IMAGE_API_KEY?.trim() || baseGeminiApiKey;
  if (required && value === "") {
    throw new Error("Missing required env var: GEMINI_IMAGE_API or GEMINI_API");
  }
  return value;
}

function getQwenApiKey(required: boolean): string {
  const value = process.env.QWEN_API_KEY?.trim() || process.env.DASHSCOPE_API_KEY?.trim() || "";
  if (required && value === "") {
    throw new Error("Missing required env var: QWEN_API_KEY or DASHSCOPE_API_KEY");
  }
  return value;
}

function getNumber(name: string, fallback: string): number {
  const raw = process.env[name] ?? fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid numeric env var: ${name}`);
  }
  return value;
}

function getBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") {
    return fallback;
  }
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function getImageFailureMode(): "fail_job" | "continue_text_only" {
  const raw = process.env.IMAGE_FAILURE_MODE?.trim() || "fail_job";
  if (raw === "fail_job" || raw === "continue_text_only") {
    return raw;
  }
  throw new Error("Invalid IMAGE_FAILURE_MODE. Use fail_job or continue_text_only.");
}

function getTextProvider(): AppConfig["textProvider"] {
  const raw = process.env.TEXT_PROVIDER?.trim() || "gemini_first";
  if (raw === "gemini_first" || raw === "gemini" || raw === "openai" || raw === "openai_compatible" || raw === "ollama" || raw === "qwen") {
    return raw;
  }
  throw new Error("Invalid TEXT_PROVIDER. Use gemini_first, gemini, openai, openai_compatible, ollama, or qwen.");
}

function getTextFallbackProvider(): AppConfig["textFallbackProvider"] {
  const raw = process.env.TEXT_FALLBACK_PROVIDER?.trim() || "openai";
  if (raw === "openai" || raw === "none") {
    return raw;
  }
  throw new Error("Invalid TEXT_FALLBACK_PROVIDER. Use openai or none.");
}

function getImageProvider(): AppConfig["imageProvider"] {
  const raw = process.env.IMAGE_PROVIDER?.trim() || "gemini_first";
  if (raw === "gemini_first" || raw === "gemini" || raw === "google_imagen" || raw === "qwen" || raw === "openai" || raw === "disabled") {
    return raw;
  }
  throw new Error("Invalid IMAGE_PROVIDER. Use gemini_first, gemini, google_imagen, qwen, openai, or disabled.");
}

function getImageFallbackProvider(): AppConfig["imageFallbackProvider"] {
  const raw = process.env.IMAGE_FALLBACK_PROVIDER?.trim() || "openai";
  if (raw === "openai" || raw === "none") {
    return raw;
  }
  throw new Error("Invalid IMAGE_FALLBACK_PROVIDER. Use openai or none.");
}

function getImageOutputSize(): string {
  const raw = process.env.IMAGE_OUTPUT_SIZE?.trim() || "512x512";
  if (/^\d{3,4}x\d{3,4}$/.test(raw)) {
    return raw;
  }
  throw new Error("Invalid IMAGE_OUTPUT_SIZE. Use a value like 512x512 or 1024x1024.");
}

function getTopicMode(): AppConfig["topicMode"] {
  const raw = process.env.TOPIC_MODE?.trim() || "auto_approve_generated";
  if (raw === "manual_only" || raw === "auto_approve_generated") {
    return raw;
  }
  throw new Error("Invalid TOPIC_MODE. Use manual_only or auto_approve_generated.");
}

function normalizeQwenImageBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  if (trimmed === "") {
    return "";
  }
  if (trimmed.endsWith("/compatible-mode/v1")) {
    return trimmed.slice(0, -"/compatible-mode/v1".length);
  }
  if (trimmed.endsWith("/api/v1")) {
    return trimmed.slice(0, -"/api/v1".length);
  }
  return trimmed;
}

export function loadConfig(): AppConfig {
  const reportEmailEnabled = getBoolean("REPORT_EMAIL_ENABLED", false);
  const publishEnabled = getBoolean("PUBLISH_ENABLED", true);
  const reelsEnabled = getBoolean("REELS_ENABLED", false);
  const textProvider = getTextProvider();
  const textFallbackProvider = getTextFallbackProvider();
  const imageProvider = getImageProvider();
  const imageFallbackProvider = getImageFallbackProvider();
  const topicMode = getTopicMode();
  const imageGenerationEnabled = getBoolean("IMAGE_GENERATION_ENABLED", true);
  const usesOpenAiText = textProvider === "openai" || (textProvider === "gemini_first" && textFallbackProvider === "openai");
  const usesOpenAiImage =
    imageGenerationEnabled && (imageProvider === "openai" || (imageProvider === "gemini_first" && imageFallbackProvider === "openai"));
  const usesGeminiText = textProvider === "gemini" || textProvider === "gemini_first";
  const usesGeminiImage =
    imageGenerationEnabled && (imageProvider === "gemini" || imageProvider === "gemini_first" || imageProvider === "google_imagen");
  const usesQwenText = textProvider === "qwen";
  const usesQwenImage = imageGenerationEnabled && imageProvider === "qwen";
  const usesGeminiTopic = topicMode === "auto_approve_generated";

  const geminiApiKey = getGeminiApiKey(usesGeminiText || usesGeminiTopic || (usesGeminiImage && !process.env.GEMINI_IMAGE_API?.trim() && !process.env.GEMINI_IMAGE_API_KEY?.trim()));
  const geminiImageApiKey = getGeminiImageApiKey(geminiApiKey, usesGeminiImage);
  const qwenApiKey = getQwenApiKey(usesQwenText || usesQwenImage);
  const qwenBaseUrl = process.env.QWEN_BASE_URL?.trim() || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const qwenImageBaseUrl = normalizeQwenImageBaseUrl(process.env.QWEN_IMAGE_BASE_URL?.trim() || qwenBaseUrl);

  return {
    pgHost: getRequired("PGHOST"),
    pgPort: Number(process.env.PGPORT || "5432"),
    pgDatabase: getRequired("PGDATABASE"),
    pgUser: getRequired("PGUSER"),
    pgPassword: getRequired("PGPASSWORD"),
    fbPageAccessToken: publishEnabled
      ? getRequired("FB_PAGE_ACCESS_TOKEN")
      : process.env.FB_PAGE_ACCESS_TOKEN?.trim() || "",
    fbGraphVersion: getRequired("FB_GRAPH_VERSION"),
    openAiApiKey: usesOpenAiText || usesOpenAiImage ? getRequired("OPENAI_API_KEY") : process.env.OPENAI_API_KEY?.trim() || "",
    openAiModel: usesOpenAiText || usesOpenAiImage ? getRequired("OPENAI_MODEL") : process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
    promptVersion: process.env.PROMPT_VERSION?.trim() || "v1",
    openAiDailyMaxRequests: getNumber("OPENAI_DAILY_MAX_REQUESTS", "20"),
    openAiDailyBudgetUsd: getNumber("OPENAI_DAILY_BUDGET_USD", "1.0"),
    openAiEstimatedCostPerRequestUsd: getNumber("OPENAI_EST_COST_PER_REQUEST_USD", "0.02"),
    autoApprove: getBoolean("AUTO_APPROVE", false),
    planStartDate: process.env.PLAN_START_DATE?.trim() || getVietnamDateString(new Date()),
    reportEmailEnabled,
    smtpHost: process.env.SMTP_HOST?.trim() || "",
    smtpPort: getNumber("SMTP_PORT", "587"),
    smtpSecure: getBoolean("SMTP_SECURE", false),
    smtpUser: process.env.SMTP_USER?.trim() || "",
    smtpPass: process.env.SMTP_PASS?.trim() || "",
    reportEmailFrom: process.env.REPORT_EMAIL_FROM?.trim() || "",
    reportEmailTo: process.env.REPORT_EMAIL_TO?.trim() || "",
    fbAppId: process.env.FB_APP_ID?.trim() || "",
    fbAppSecret: process.env.FB_APP_SECRET?.trim() || "",
    geminiApiKey,
    geminiImageApiKey,
    geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    geminiImageModel: process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image",
    googleImagenModel: process.env.GOOGLE_IMAGEN_MODEL?.trim() || "imagen-4.0-fast-generate-001",
    qwenApiKey,
    qwenModel: process.env.QWEN_MODEL?.trim() || "qwen-max",
    qwenImageModel: process.env.QWEN_IMAGE_MODEL?.trim() || "qwen-image",
    qwenBaseUrl,
    qwenImageBaseUrl,
    textProvider,
    textFallbackProvider,
    textOpenAiCompatibleBaseUrl: process.env.TEXT_OPENAI_COMPATIBLE_BASE_URL?.trim() || "",
    textOpenAiCompatibleModel: process.env.TEXT_OPENAI_COMPATIBLE_MODEL?.trim() || "",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434/v1",
    ollamaModel: process.env.OLLAMA_MODEL?.trim() || "",
    imageProvider,
    imageFallbackProvider,
    imageGenerationEnabled,
    imageOutputSize: getImageOutputSize(),
    imageFailureMode: getImageFailureMode(),
    topicMode,
    topicDuplicateLookbackDays: getNumber("TOPIC_DUPLICATE_LOOKBACK_DAYS", "60"),
    quarterlyTopicPlanEnabled: getBoolean("QUARTERLY_TOPIC_PLAN_ENABLED", true),
    quarterlyTopicLeadDays: getNumber("QUARTERLY_TOPIC_LEAD_DAYS", "15"),
    geminiOperationMaxAttempts: Math.max(1, Math.min(2, getNumber("GEMINI_OPERATION_MAX_ATTEMPTS", "2"))),
    publishEnabled,
    reelsEnabled,
  };
}

export function loadDbConfig(): DbConfig {
  return {
    pgHost: getRequired("PGHOST"),
    pgPort: Number(process.env.PGPORT || "5432"),
    pgDatabase: getRequired("PGDATABASE"),
    pgUser: getRequired("PGUSER"),
    pgPassword: getRequired("PGPASSWORD"),
  };
}
