import nodemailer from "nodemailer";
import { loadConfig } from "../config/env";
import { pool } from "../db/pool";
import { getVietnamDateString } from "../utils/dateTime";

type DailyStats = {
  reportDate: string;
  planTopic: string | null;
  generatedCount: number;
  autoApprovedCount: number;
  draftCount: number;
  publishSuccessCount: number;
  publishFailCount: number;
  latestPublishError: string | null;
  openAiSuccessCount: number;
  openAiFailedCount: number;
  openAiBlockedCount: number;
  openAiCostUsd: number;
  geminiUsage: GeminiUsageReport[];
  publishedPosts: PublishedPostReport[];
};

type GeminiUsageReport = {
  operationType: string;
  operationCount: number;
  attempts: number;
  cacheHits: number;
  duplicateOperationCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type PublishedPostReport = {
  postId: number;
  platformPostId: string;
  title: string | null;
  body: string;
  cta: string | null;
  permalinkUrl: string | null;
  reactionsCount: number | null;
  commentsCount: number | null;
  sharesCount: number | null;
  viewsCount: number | null;
  metricsError: string | null;
};

type FbInsightsResponse = {
  data?: Array<{
    name?: string;
    values?: Array<{ value?: number | string | Record<string, number> }>;
  }>;
};

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}...`;
}

async function fetchFbPostMetrics(
  platformPostId: string,
  cfg: ReturnType<typeof loadConfig>
): Promise<{
  permalinkUrl: string | null;
  reactionsCount: number | null;
  commentsCount: number | null;
  sharesCount: number | null;
  viewsCount: number | null;
  metricsError: string | null;
}> {
  const baseUrl = `https://graph.facebook.com/${cfg.fbGraphVersion}/${platformPostId}`;
  const authHeaders = { Authorization: `Bearer ${cfg.fbPageAccessToken}` };
  try {
    const fieldsResp = await fetch(
      `${baseUrl}?fields=permalink_url,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares`,
      { headers: authHeaders }
    );
    const fieldsPayload = (await fieldsResp.json()) as {
      error?: { message?: string };
      permalink_url?: string;
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    };

    if (!fieldsResp.ok) {
      const msg = fieldsPayload?.error?.message ?? `HTTP ${fieldsResp.status}`;
      return {
        permalinkUrl: null,
        reactionsCount: null,
        commentsCount: null,
        sharesCount: null,
        viewsCount: null,
        metricsError: msg,
      };
    }

    const insightsResp = await fetch(
      `${baseUrl}/insights?metric=post_impressions`,
      { headers: authHeaders }
    );
    const insightsPayload = (await insightsResp.json()) as FbInsightsResponse & { error?: { message?: string } };

    let viewsCount: number | null = null;
    let metricsError: string | null = null;
    if (!insightsResp.ok) {
      metricsError = insightsPayload?.error?.message ?? `Insights HTTP ${insightsResp.status}`;
    } else {
      const value = insightsPayload.data?.[0]?.values?.[0]?.value;
      if (typeof value === "number") {
        viewsCount = value;
      } else if (typeof value === "string") {
        const parsed = Number(value);
        viewsCount = Number.isFinite(parsed) ? parsed : null;
      }
    }

    return {
      permalinkUrl: fieldsPayload.permalink_url ?? null,
      reactionsCount: fieldsPayload.reactions?.summary?.total_count ?? null,
      commentsCount: fieldsPayload.comments?.summary?.total_count ?? null,
      sharesCount: fieldsPayload.shares?.count ?? 0,
      viewsCount,
      metricsError,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown FB metric error";
    return {
      permalinkUrl: null,
      reactionsCount: null,
      commentsCount: null,
      sharesCount: null,
      viewsCount: null,
      metricsError: message,
    };
  }
}

async function fetchPublishedPostsReport(reportDate: string, cfg: ReturnType<typeof loadConfig>): Promise<PublishedPostReport[]> {
  const rows = await pool.query<{
    post_id: string;
    platform_post_id: string;
    title: string | null;
    body: string;
    cta: string | null;
  }>(
    `
    SELECT DISTINCT ON (pa.post_id)
      pa.post_id,
      pa.platform_post_id,
      p.title,
      p.body,
      p.cta
    FROM publish_attempts pa
    JOIN posts p ON p.id = pa.post_id
    WHERE pa.status = 'success'
      AND pa.created_at::date = $1::date
    ORDER BY pa.post_id, pa.id DESC
    `,
    [reportDate]
  );

  const reports: PublishedPostReport[] = [];
  for (const row of rows.rows) {
    const m = await fetchFbPostMetrics(row.platform_post_id, cfg);
    reports.push({
      postId: Number(row.post_id),
      platformPostId: row.platform_post_id,
      title: row.title,
      body: row.body,
      cta: row.cta,
      permalinkUrl: m.permalinkUrl,
      reactionsCount: m.reactionsCount,
      commentsCount: m.commentsCount,
      sharesCount: m.sharesCount,
      viewsCount: m.viewsCount,
      metricsError: m.metricsError,
    });
  }

  return reports;
}

async function fetchDailyStats(reportDate: string, cfg: ReturnType<typeof loadConfig>): Promise<DailyStats> {
  const plan = await pool.query<{ topic: string }>(
    "SELECT topic FROM content_plan WHERE is_active = true AND plan_date = $1 LIMIT 1",
    [reportDate]
  );

  const posts = await pool.query<{ generated_count: string; auto_approved_count: string; draft_count: string }>(
    `
    SELECT
      COUNT(*)::int AS generated_count,
      COUNT(*) FILTER (WHERE approval_status = 'auto_approved')::int AS auto_approved_count,
      COUNT(*) FILTER (WHERE approval_status = 'draft')::int AS draft_count
    FROM posts
    WHERE created_at::date = $1::date
    `,
    [reportDate]
  );

  const publish = await pool.query<{ success_count: string; fail_count: string; latest_error: string | null }>(
    `
    SELECT
      COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS fail_count,
      (
        SELECT error_message
        FROM publish_attempts
        WHERE created_at::date = $1::date
          AND status = 'failed'
        ORDER BY id DESC
        LIMIT 1
      ) AS latest_error
    FROM publish_attempts
    WHERE created_at::date = $1::date
    `,
    [reportDate]
  );

  const usage = await pool.query<{ success_count: string; failed_count: string; blocked_count: string; cost_usd: string }>(
    `
    SELECT
      COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
      COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_count,
      COALESCE(SUM(estimated_cost_usd), 0)::numeric(12,6) AS cost_usd
    FROM openai_usage_logs
    WHERE request_date = $1::date
    `,
    [reportDate]
  );
  const geminiUsage = await pool.query<{
    operation_type: string;
    operation_count: string;
    attempts: string;
    cache_hits: string;
    duplicate_operation_count: string;
    input_tokens: string;
    output_tokens: string;
    total_tokens: string;
  }>(
    `
    SELECT
      operation_type,
      COUNT(*)::text AS operation_count,
      COALESCE(SUM(attempt_count), 0)::text AS attempts,
      COALESCE(SUM(cache_hit_count), 0)::text AS cache_hits,
      COUNT(*) FILTER (WHERE attempt_count > 1)::text AS duplicate_operation_count,
      COALESCE(SUM(input_tokens), 0)::text AS input_tokens,
      COALESCE(SUM(output_tokens), 0)::text AS output_tokens,
      COALESCE(SUM(total_tokens), 0)::text AS total_tokens
    FROM provider_operations
    WHERE provider = 'gemini'
      AND created_at::date = $1::date
    GROUP BY operation_type
    ORDER BY operation_type
    `,
    [reportDate]
  );

  const publishedPosts = await fetchPublishedPostsReport(reportDate, cfg);

  return {
    reportDate,
    planTopic: plan.rows[0]?.topic ?? null,
    generatedCount: Number(posts.rows[0]?.generated_count ?? 0),
    autoApprovedCount: Number(posts.rows[0]?.auto_approved_count ?? 0),
    draftCount: Number(posts.rows[0]?.draft_count ?? 0),
    publishSuccessCount: Number(publish.rows[0]?.success_count ?? 0),
    publishFailCount: Number(publish.rows[0]?.fail_count ?? 0),
    latestPublishError: publish.rows[0]?.latest_error ?? null,
    openAiSuccessCount: Number(usage.rows[0]?.success_count ?? 0),
    openAiFailedCount: Number(usage.rows[0]?.failed_count ?? 0),
    openAiBlockedCount: Number(usage.rows[0]?.blocked_count ?? 0),
    openAiCostUsd: Number(usage.rows[0]?.cost_usd ?? 0),
    geminiUsage: geminiUsage.rows.map((row) => ({
      operationType: row.operation_type,
      operationCount: Number(row.operation_count),
      attempts: Number(row.attempts),
      cacheHits: Number(row.cache_hits),
      duplicateOperationCount: Number(row.duplicate_operation_count),
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      totalTokens: Number(row.total_tokens),
    })),
    publishedPosts,
  };
}

function buildSubject(stats: DailyStats): string {
  const state = stats.publishSuccessCount > 0 ? "GREEN" : stats.generatedCount > 0 ? "YELLOW" : "RED";
  return `[Daily Report][${state}] ${stats.reportDate}`;
}

function buildText(stats: DailyStats): string {
  const geminiUsageSections =
    stats.geminiUsage.length === 0
      ? ["Gemini usage: none"]
      : stats.geminiUsage.map(
          (usage) =>
            `Gemini ${usage.operationType}: operations=${usage.operationCount}, attempts=${usage.attempts}, cache_hits=${usage.cacheHits}, repeated_operations=${usage.duplicateOperationCount}, input_tokens=${usage.inputTokens}, output_tokens=${usage.outputTokens}, total_tokens=${usage.totalTokens}`
        );
  const publishedPostSections =
    stats.publishedPosts.length === 0
      ? ["Published posts detail: none"]
      : stats.publishedPosts.flatMap((p, idx) => [
          "",
          `Post #${idx + 1} (post_id=${p.postId})`,
          `Title: ${p.title ?? "N/A"}`,
          `Content: ${truncateText([p.body, p.cta ?? ""].filter(Boolean).join(" "), 1200)}`,
          `Views (impressions): ${p.viewsCount ?? "N/A"}`,
          `Reactions: ${p.reactionsCount ?? "N/A"} | Comments: ${p.commentsCount ?? "N/A"} | Shares: ${p.sharesCount ?? "N/A"}`,
          `Permalink: ${p.permalinkUrl ?? "N/A"}`,
          `Metrics error: ${p.metricsError ?? "None"}`,
        ]);

  return [
    `Daily Report - ${stats.reportDate}`,
    ``,
    `Plan topic: ${stats.planTopic ?? "N/A"}`,
    `Generated posts: ${stats.generatedCount}`,
    `Auto approved: ${stats.autoApprovedCount}`,
    `Draft: ${stats.draftCount}`,
    ``,
    `Publish success: ${stats.publishSuccessCount}`,
    `Publish failed: ${stats.publishFailCount}`,
    `Latest publish error: ${stats.latestPublishError ?? "N/A"}`,
    ``,
    `OpenAI success: ${stats.openAiSuccessCount}`,
    `OpenAI failed: ${stats.openAiFailedCount}`,
    `OpenAI blocked: ${stats.openAiBlockedCount}`,
    `OpenAI estimated cost (USD): ${stats.openAiCostUsd.toFixed(4)}`,
    ...geminiUsageSections,
    "",
    ...publishedPostSections,
  ].join("\n");
}

export type DailyReportEmailResult =
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "sent";
      to: string;
      date: string;
    };

export async function runDailyReportEmail(): Promise<DailyReportEmailResult> {
  const cfg = loadConfig();
  if (!cfg.reportEmailEnabled) {
    console.log("REPORT_EMAIL_ENABLED is false. Skip sending.");
    return { status: "skipped", reason: "REPORT_EMAIL_ENABLED is false" };
  }
  const required = [cfg.smtpHost, cfg.smtpUser, cfg.smtpPass, cfg.reportEmailFrom, cfg.reportEmailTo];
  if (required.some((x) => !x)) {
    throw new Error("Missing SMTP/report email configuration in .env");
  }

  const reportDate = getVietnamDateString(new Date());
  const stats = await fetchDailyStats(reportDate, cfg);

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  });

  await transporter.sendMail({
    from: cfg.reportEmailFrom,
    to: cfg.reportEmailTo,
    subject: buildSubject(stats),
    text: buildText(stats),
  });

  const result: DailyReportEmailResult = { status: "sent", to: cfg.reportEmailTo, date: reportDate };
  console.log(JSON.stringify({ sent: true, to: result.to, date: result.date }, null, 2));
  return result;
}

if (require.main === module) {
  runDailyReportEmail()
    .catch((err) => {
      console.error("report:email failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
