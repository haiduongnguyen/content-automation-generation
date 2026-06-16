import { pool } from "../db/pool";
import {
  getRetryablePipelineJobs,
  insertPipelineJobEvent,
  requeuePipelineJob,
} from "../services/pipelineJobs";

export async function retryFailedJobs(): Promise<void> {
  const jobs = await getRetryablePipelineJobs();
  const retried: Array<{ id: string; jobType: string; runDate: string; attemptCount: number | string; maxAttempts: number | string }> = [];

  for (const job of jobs) {
    const requeued = await requeuePipelineJob(Number(job.id));
    if (!requeued) {
      continue;
    }
    await insertPipelineJobEvent({
      jobId: Number(job.id),
      eventType: "requeued",
      message: `Requeued failed ${job.job_type} job`,
      payload: {
        previousStatus: job.status,
        attemptCount: job.attempt_count,
        maxAttempts: job.max_attempts,
      },
    });
    retried.push({
      id: requeued.id,
      jobType: requeued.job_type,
      runDate: requeued.run_date,
      attemptCount: requeued.attempt_count,
      maxAttempts: requeued.max_attempts,
    });
  }

  console.log(
    JSON.stringify(
      {
        retryableFound: jobs.length,
        requeued: retried.length,
        jobs: retried,
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  retryFailedJobs()
    .catch((err) => {
      console.error("retry:failed failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
