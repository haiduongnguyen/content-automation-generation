import { loadConfig } from "../config/env";
import { queryOneFromFile } from "../db/sqlRunner";

export type UsageSummary = {
  request_count: number;
  total_cost_usd: string;
};

export function checkQuota(args: {
  requestCountToday: number;
  totalCostTodayUsd: number;
  maxRequestsPerDay: number;
  dailyBudgetUsd: number;
  estimatedCostPerRequestUsd: number;
}): { allowed: boolean; reason?: string } {
  const {
    requestCountToday,
    totalCostTodayUsd,
    maxRequestsPerDay,
    dailyBudgetUsd,
    estimatedCostPerRequestUsd,
  } = args;

  if (requestCountToday >= maxRequestsPerDay) {
    return { allowed: false, reason: `OpenAI daily request cap reached (${maxRequestsPerDay}).` };
  }

  if (totalCostTodayUsd + estimatedCostPerRequestUsd > dailyBudgetUsd) {
    return {
      allowed: false,
      reason: `OpenAI daily budget exceeded (${dailyBudgetUsd} USD).`,
    };
  }

  return { allowed: true };
}

export async function assertOpenAiQuotaAvailable(topicName: string): Promise<void> {
  const cfg = loadConfig();
  const today = new Date().toISOString().slice(0, 10);

  const summary = await queryOneFromFile<UsageSummary>("014_get_openai_usage_summary_today.sql", {
    request_date: today,
  });

  const requestCountToday = Number(summary.request_count || 0);
  const totalCostTodayUsd = Number(summary.total_cost_usd || 0);

  const decision = checkQuota({
    requestCountToday,
    totalCostTodayUsd,
    maxRequestsPerDay: cfg.openAiDailyMaxRequests,
    dailyBudgetUsd: cfg.openAiDailyBudgetUsd,
    estimatedCostPerRequestUsd: cfg.openAiEstimatedCostPerRequestUsd,
  });

  if (!decision.allowed) {
    await queryOneFromFile("015_insert_openai_usage_log.sql", {
      request_date: today,
      model_name: cfg.openAiModel,
      topic_name: topicName,
      status: "blocked",
      estimated_cost_usd: 0,
      error_message: decision.reason || "Quota blocked",
    });
    throw new Error(decision.reason || "OpenAI quota blocked");
  }
}

export async function logOpenAiUsage(args: {
  topicName: string;
  status: "success" | "failed";
  errorMessage?: string;
}): Promise<void> {
  const cfg = loadConfig();
  const today = new Date().toISOString().slice(0, 10);

  await queryOneFromFile("015_insert_openai_usage_log.sql", {
    request_date: today,
    model_name: cfg.openAiModel,
    topic_name: args.topicName,
    status: args.status,
    estimated_cost_usd: cfg.openAiEstimatedCostPerRequestUsd,
    error_message: args.errorMessage || null,
  });
}
