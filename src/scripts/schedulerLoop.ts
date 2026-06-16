import { pool } from "../db/pool";
import { enqueuePipelineJob, getRetryablePipelineJobs, insertPipelineJobEvent, requeuePipelineJob } from "../services/pipelineJobs";
import { getScheduledRunDate, isAtOrAfterSchedule, secondsToMs } from "../services/serverScheduler";

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid numeric env var: ${name}`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryFailedJobsOnce(): Promise<number> {
  const jobs = await getRetryablePipelineJobs();
  let count = 0;
  for (const job of jobs) {
    const requeued = await requeuePipelineJob(Number(job.id));
    if (!requeued) {
      continue;
    }
    await insertPipelineJobEvent({
      jobId: Number(job.id),
      eventType: "requeued",
      message: `Scheduler requeued failed ${job.job_type} job`,
      payload: {
        previousStatus: job.status,
        attemptCount: job.attempt_count,
        maxAttempts: job.max_attempts,
      },
    });
    count += 1;
  }
  return count;
}

export async function schedulerLoop(): Promise<void> {
  const scheduleTime = process.env.DAILY_PIPELINE_TIME?.trim() || "21:00";
  const pollMs = secondsToMs(getNumberEnv("SCHEDULER_POLL_SECONDS", 60));
  const retryEveryMs = secondsToMs(getNumberEnv("RETRY_FAILED_SECONDS", 3600));
  let lastRetryAt = 0;

  console.log(JSON.stringify({ scheduler: "started", scheduleTime, pollSeconds: pollMs / 1000 }, null, 2));

  while (true) {
    const now = new Date();
    try {
      if (isAtOrAfterSchedule(now, scheduleTime)) {
        const runDate = getScheduledRunDate(now);
        const job = await enqueuePipelineJob({
          jobType: "daily_content",
          runDate,
          maxAttempts: 3,
          payload: { source: "scheduler_loop", scheduleTime },
        });
        console.log(JSON.stringify({ scheduler: "daily_checked", jobId: job.id, runDate: job.run_date, status: job.status }, null, 2));
      }

      if (Date.now() - lastRetryAt >= retryEveryMs) {
        const requeued = await retryFailedJobsOnce();
        lastRetryAt = Date.now();
        console.log(JSON.stringify({ scheduler: "retry_checked", requeued }, null, 2));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown scheduler error";
      console.error("scheduler loop error", message);
    }

    await sleep(pollMs);
  }
}

if (require.main === module) {
  schedulerLoop()
    .catch((err) => {
      console.error("scheduler:loop failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
