import { pool } from "../../db/pool";

export type OperationalHealthSummary = {
  generatedAt: string;
  pipelineJobs: {
    queued: number;
    running: number;
    completed24h: number;
    failed24h: number;
  };
  contentJobs: {
    generated24h: number;
    posted24h: number;
    failed24h: number;
  };
  recentFailures: Array<{
    id: string;
    job_type: string;
    run_date: string;
    error_message: string | null;
    updated_at: string;
  }>;
};

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

export async function getOperationalHealthSummary(): Promise<OperationalHealthSummary> {
  const pipelineCounts = await pool.query<{
    queued: string;
    running: string;
    completed24h: string;
    failed24h: string;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'queued')::text AS queued,
      COUNT(*) FILTER (WHERE status = 'running')::text AS running,
      COUNT(*) FILTER (WHERE status = 'completed' AND updated_at >= NOW() - INTERVAL '24 hours')::text AS completed24h,
      COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '24 hours')::text AS failed24h
    FROM pipeline_jobs
  `);

  const contentCounts = await pool.query<{
    generated24h: string;
    posted24h: string;
    failed24h: string;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'generated' AND updated_at >= NOW() - INTERVAL '24 hours')::text AS generated24h,
      COUNT(*) FILTER (WHERE status = 'posted' AND updated_at >= NOW() - INTERVAL '24 hours')::text AS posted24h,
      COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '24 hours')::text AS failed24h
    FROM content_jobs
  `);

  const recentFailures = await pool.query<OperationalHealthSummary["recentFailures"][number]>(`
    SELECT id::text, job_type, run_date::text, error_message, updated_at::text
    FROM pipeline_jobs
    WHERE status = 'failed'
    ORDER BY updated_at DESC
    LIMIT 10
  `);

  const pipeline = pipelineCounts.rows[0];
  const content = contentCounts.rows[0];

  return {
    generatedAt: new Date().toISOString(),
    pipelineJobs: {
      queued: toNumber(pipeline?.queued),
      running: toNumber(pipeline?.running),
      completed24h: toNumber(pipeline?.completed24h),
      failed24h: toNumber(pipeline?.failed24h),
    },
    contentJobs: {
      generated24h: toNumber(content?.generated24h),
      posted24h: toNumber(content?.posted24h),
      failed24h: toNumber(content?.failed24h),
    },
    recentFailures: recentFailures.rows,
  };
}
