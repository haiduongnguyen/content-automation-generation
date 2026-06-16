import os from "node:os";
import { queryManyFromFile, queryOneFromFile } from "../db/sqlRunner";
import { getVietnamDateString } from "../utils/dateTime";

export type PipelineJobType = "daily_content" | "publish" | "report" | "backfill";
export type PipelineJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type PipelineJobRow = {
  id: string;
  job_type: PipelineJobType;
  run_date: string;
  status: PipelineJobStatus;
  attempt_count: number | string;
  max_attempts: number | string;
  locked_at: string | null;
  locked_by: string | null;
  payload: unknown;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type PipelineJobEventRow = {
  id: string;
  job_id: string;
  event_type: string;
  message: string | null;
  payload: unknown;
  created_at: string;
};

export function buildWorkerId(prefix = "local"): string {
  return `${prefix}:${os.hostname()}:${process.pid}`;
}

export function serializeJobPayload(payload: unknown): string {
  if (payload === null || payload === undefined) {
    return "{}";
  }
  return JSON.stringify(payload);
}

export function getTodayRunDate(now = new Date()): string {
  return getVietnamDateString(now);
}

export async function enqueuePipelineJob(args: {
  jobType: PipelineJobType;
  runDate: string;
  maxAttempts?: number;
  payload?: unknown;
}): Promise<PipelineJobRow> {
  return queryOneFromFile<PipelineJobRow>("028_enqueue_pipeline_job.sql", {
    job_type: args.jobType,
    run_date: args.runDate,
    max_attempts: args.maxAttempts ?? 3,
    payload_json: serializeJobPayload(args.payload),
  });
}

export async function claimNextPipelineJob(workerId: string): Promise<PipelineJobRow | null> {
  const rows = await queryManyFromFile<PipelineJobRow>("029_claim_next_pipeline_job.sql", {
    worker_id: workerId,
  });
  return rows[0] ?? null;
}

export async function insertPipelineJobEvent(args: {
  jobId: number;
  eventType: string;
  message?: string | null;
  payload?: unknown;
}): Promise<PipelineJobEventRow> {
  return queryOneFromFile<PipelineJobEventRow>("030_insert_pipeline_job_event.sql", {
    job_id: args.jobId,
    event_type: args.eventType,
    message: args.message ?? null,
    payload_json: serializeJobPayload(args.payload),
  });
}

export async function markPipelineJobCompleted(jobId: number): Promise<PipelineJobRow> {
  return queryOneFromFile<PipelineJobRow>("031_mark_pipeline_job_completed.sql", {
    job_id: jobId,
  });
}

export async function markPipelineJobFailed(args: {
  jobId: number;
  errorMessage: string;
}): Promise<PipelineJobRow> {
  return queryOneFromFile<PipelineJobRow>("032_mark_pipeline_job_failed.sql", {
    job_id: args.jobId,
    error_message: args.errorMessage,
  });
}

export function isRetryablePipelineJob(job: Pick<PipelineJobRow, "status" | "attempt_count" | "max_attempts">): boolean {
  return job.status === "failed" && Number(job.attempt_count) < Number(job.max_attempts);
}

export async function getRetryablePipelineJobs(): Promise<PipelineJobRow[]> {
  return queryManyFromFile<PipelineJobRow>("034_get_retryable_pipeline_jobs.sql");
}

export async function requeuePipelineJob(jobId: number): Promise<PipelineJobRow | null> {
  const rows = await queryManyFromFile<PipelineJobRow>("035_requeue_pipeline_job.sql", {
    job_id: jobId,
  });
  return rows[0] ?? null;
}
