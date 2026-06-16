import { pool } from "../db/pool";
import {
  buildWorkerId,
  claimNextPipelineJob,
  insertPipelineJobEvent,
  markPipelineJobCompleted,
  markPipelineJobFailed,
  type PipelineJobRow,
} from "../services/pipelineJobs";
import { runDailyPipeline } from "./runDailyPipeline";

async function runJob(job: PipelineJobRow): Promise<void> {
  if (job.job_type === "daily_content") {
    await runDailyPipeline({
      onEvent: async (event) => {
        await insertPipelineJobEvent({
          jobId: Number(job.id),
          eventType: event.eventType,
          message: event.message,
          payload: event.payload,
        });
      },
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
  console.log(JSON.stringify({ claimed: true, workerId, jobId, jobType: job.job_type }, null, 2));

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
