import { pool } from "../db/pool";
import {
  buildWorkerId,
  claimNextPipelineJob,
  insertPipelineJobEvent,
  markPipelineJobCompleted,
  markPipelineJobFailed,
  normalizeRunDate,
  type PipelineJobRow,
} from "../services/pipelineJobs";
import { runDailyPipeline } from "./runDailyPipeline";
import { runPublishOnce } from "./publishOnce";
import { generateQuarterlyTopicPlan } from "../services/quarterlyTopicPlan";

function readPayloadPostId(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = Number((payload as Record<string, unknown>).postId);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function readPayloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function runJob(job: PipelineJobRow): Promise<void> {
  if (job.job_type === "daily_content") {
    await runDailyPipeline({
      context: { jobId: Number(job.id), runDate: normalizeRunDate(job.run_date), scheduledSlot: job.scheduled_slot, source: "worker" },
    });
    return;
  }
  if (job.job_type === "publish") {
    const postId = readPayloadPostId(job.payload);
    if (!postId) {
      throw new Error(`Publish job ${job.id} is missing a valid payload.postId.`);
    }
    await runPublishOnce({ postId });
    return;
  }
  if (job.job_type === "quarterly_topic_plan") {
    const quarterKey = readPayloadString(job.payload, "quarterKey");
    if (!quarterKey) {
      throw new Error(`Quarterly topic job ${job.id} is missing payload.quarterKey.`);
    }
    await generateQuarterlyTopicPlan({
      quarterKey,
      fromDate: readPayloadString(job.payload, "fromDate") ?? undefined,
    });
    return;
  }
  throw new Error(`Unsupported pipeline job type: ${job.job_type}`);
}

export async function workerOnce(): Promise<void> {
  const workerId = buildWorkerId("worker");
  const job = await claimNextPipelineJob(workerId);
  if (!job) {
    console.log(JSON.stringify({ claimed: false, workerId }, null, 2));
    return;
  }

  const jobId = Number(job.id);
  console.log(JSON.stringify({ claimed: true, workerId, jobId, jobType: job.job_type, scheduledSlot: job.scheduled_slot }, null, 2));

  try {
    await insertPipelineJobEvent({
      jobId,
      eventType: "started",
      message: `Worker ${workerId} started ${job.job_type}`,
      payload: { workerId },
    });
    await runJob(job);
    await insertPipelineJobEvent({
      jobId,
      eventType: "completed",
      message: `Worker ${workerId} completed ${job.job_type}`,
      payload: { workerId },
    });
    await markPipelineJobCompleted(jobId);
    console.log(JSON.stringify({ completed: true, workerId, jobId }, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown worker error";
    await insertPipelineJobEvent({
      jobId,
      eventType: "failed",
      message,
      payload: { workerId },
    });
    await markPipelineJobFailed({ jobId, errorMessage: message });
    throw err;
  }
}

if (require.main === module) {
  workerOnce()
    .catch((err) => {
      console.error("worker:once failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
