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
  geminiModel: string;
  imageGenerationEnabled: boolean;
  imageFailureMode: "fail_job" | "continue_text_only";
  publishEnabled: boolean;
};

export type DbConfig = Pick<AppConfig, "pgHost" | "pgPort" | "pgDatabase" | "pgUser" | "pgPassword">;

function getRequired(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
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

export function loadConfig(): AppConfig {
  const reportEmailEnabled = getBoolean("REPORT_EMAIL_ENABLED", false);
  const publishEnabled = getBoolean("PUBLISH_ENABLED", true);

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
    openAiApiKey: getRequired("OPENAI_API_KEY"),
    openAiModel: getRequired("OPENAI_MODEL"),
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
    geminiApiKey: process.env.GEMINI_API?.trim() || process.env.GEMINI_API_KEY?.trim() || "",
    geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    imageGenerationEnabled: getBoolean("IMAGE_GENERATION_ENABLED", true),
    imageFailureMode: getImageFailureMode(),
    publishEnabled,
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
