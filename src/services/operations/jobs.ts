import { pool } from "../../db/pool";
import {
  insertPipelineJobEvent,
  isRetryablePipelineJob,
  requeuePipelineJob,
  type PipelineJobEventRow,
  type PipelineJobRow,
} from "../pipelineJobs";

export type JobDetails = {
  job: PipelineJobRow;
  events: PipelineJobEventRow[];
  contentJobs: Array<{ id: string; run_date: string; scheduled_slot: string; status: string; error_message: string | null }>;
  posts: Array<{ id: string; job_id: string; title: string | null; approval_status: string; created_at: string }>;
};

export async function listPipelineJobs(limit = 20): Promise<PipelineJobRow[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const result = await pool.query<PipelineJobRow>(
    `
    SELECT id, job_type, run_date::text AS run_date, scheduled_slot, status, attempt_count, max_attempts, locked_at, locked_by,
           payload, error_message, created_at, updated_at
    FROM pipeline_jobs
    ORDER BY updated_at DESC, id DESC
    LIMIT $1
    `,
    [boundedLimit]
  );
  return result.rows;
}

export async function getPipelineJobDetails(jobId: number): Promise<JobDetails | null> {
  const jobResult = await pool.query<PipelineJobRow>(
    `
    SELECT id, job_type, run_date::text AS run_date, scheduled_slot, status, attempt_count, max_attempts, locked_at, locked_by,
           payload, error_message, created_at, updated_at
    FROM pipeline_jobs
    WHERE id = $1
    `,
    [jobId]
  );
  const job = jobResult.rows[0];
  if (!job) {
    return null;
  }

  const eventsResult = await pool.query<PipelineJobEventRow>(
    `
    SELECT id, job_id, event_type, message, payload, created_at
    FROM pipeline_job_events
    WHERE job_id = $1
    ORDER BY created_at ASC, id ASC
    `,
    [jobId]
  );
  const contentJobsResult = await pool.query<{ id: string; run_date: string; scheduled_slot: string; status: string; error_message: string | null }>(
    `
    SELECT id, run_date::text AS run_date, scheduled_slot, status, error_message
    FROM content_jobs
    WHERE run_date = $1
      AND scheduled_slot = $2
    ORDER BY id ASC
    `,
    [job.run_date, job.scheduled_slot]
  );
  const postsResult = await pool.query<{ id: string; job_id: string; title: string | null; approval_status: string; created_at: string }>(
    `
    SELECT p.id, p.job_id, p.title, p.approval_status, p.created_at
    FROM posts p
    JOIN content_jobs cj ON cj.id = p.job_id
    WHERE cj.run_date = $1
      AND cj.scheduled_slot = $2
    ORDER BY p.created_at DESC
    `,
    [job.run_date, job.scheduled_slot]
  );

  return { job, events: eventsResult.rows, contentJobs: contentJobsResult.rows, posts: postsResult.rows };
}

export async function retryPipelineJobById(jobId: number): Promise<PipelineJobRow> {
  const details = await getPipelineJobDetails(jobId);
  if (!details) {
    throw new Error(`Pipeline job not found: ${jobId}`);
  }
  if (!isRetryablePipelineJob(details.job)) {
    throw new Error(`Pipeline job ${jobId} is not retryable.`);
  }
  const requeued = await requeuePipelineJob(jobId);
  if (!requeued) {
    throw new Error(`Pipeline job ${jobId} could not be requeued.`);
  }
  await insertPipelineJobEvent({
    jobId,
    eventType: "requeued",
    message: "Job requeued from operational CLI",
    payload: {
      previousStatus: details.job.status,
      attemptCount: details.job.attempt_count,
      maxAttempts: details.job.max_attempts,
    },
  });
  return requeued;
}
