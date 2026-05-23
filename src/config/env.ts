import dotenv from "dotenv";
import { getVietnamDateString } from "../utils/dateTime";

dotenv.config({ override: true });

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
};

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

export function loadConfig(): AppConfig {
  const reportEmailEnabled = getBoolean("REPORT_EMAIL_ENABLED", false);

  return {
    pgHost: getRequired("PGHOST"),
    pgPort: Number(process.env.PGPORT || "5432"),
    pgDatabase: getRequired("PGDATABASE"),
    pgUser: getRequired("PGUSER"),
    pgPassword: getRequired("PGPASSWORD"),
    fbPageAccessToken: getRequired("FB_PAGE_ACCESS_TOKEN"),
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
  };
}
