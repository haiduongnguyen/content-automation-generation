import { pool } from "../db/pool";
import { enqueuePipelineJob, getRetryablePipelineJobs, insertPipelineJobEvent, requeuePipelineJob } from "../services/pipelineJobs";
import { getScheduledRunDate, isAtOrAfterSchedule, parseScheduleTimes, secondsToMs } from "../services/serverScheduler";
import { getQuarterKeysToEnsure, getQuarterRange, isQuarterPlanActive } from "../services/quarterlyTopicPlan";
import { loadConfig } from "../config/env";

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

export function isDailyPipelineEnabled(): boolean {
  const raw = process.env.DAILY_PIPELINE_ENABLED;
  if (!raw || raw.trim() === "") {
    return true;
  }
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export function shouldDispatchSchedule(dispatchedSlots: Set<string>, runDate: string, scheduledSlot: string, due: boolean): boolean {
  return due && !dispatchedSlots.has(`${runDate}:${scheduledSlot}`);
}

async function retryFailedJobsOnce(dailyPipelineEnabled: boolean): Promise<number> {
  const jobs = await getRetryablePipelineJobs();
  let count = 0;
  for (const job of jobs) {
    if (!dailyPipelineEnabled && job.job_type === "daily_content") {
      continue;
    }
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

async function enqueueQuarterlyPlans(runDate: string): Promise<number> {
  const cfg = loadConfig();
  if (!cfg.quarterlyTopicPlanEnabled) {
    return 0;
  }
  let enqueued = 0;
  for (const quarterKey of getQuarterKeysToEnsure(runDate, cfg.quarterlyTopicLeadDays)) {
    if (await isQuarterPlanActive(quarterKey)) {
      continue;
    }
    const range = getQuarterRange(quarterKey);
    const fromDate = runDate >= range.start && runDate <= range.end ? runDate : range.start;
    await enqueuePipelineJob({
      jobType: "quarterly_topic_plan",
      runDate: range.start,
      scheduledSlot: "quarterly_plan",
      maxAttempts: 3,
      payload: { source: "scheduler_loop", quarterKey, fromDate },
    });
    enqueued += 1;
  }
  return enqueued;
}

export async function schedulerLoop(): Promise<void> {
  const scheduleTimes = parseScheduleTimes(process.env.DAILY_PIPELINE_TIMES?.trim() || process.env.DAILY_PIPELINE_TIME?.trim() || "09:00,21:00");
  const dailyPipelineEnabled = isDailyPipelineEnabled();
  const pollMs = secondsToMs(getNumberEnv("SCHEDULER_POLL_SECONDS", 60));
  const retryEveryMs = secondsToMs(getNumberEnv("RETRY_FAILED_SECONDS", 3600));
  let lastRetryAt = 0;
  let lastQuarterCheckAt = 0;
  const dispatchedSlots = new Set<string>();

  console.log(JSON.stringify({ scheduler: "started", scheduleTimes, dailyPipelineEnabled, pollSeconds: pollMs / 1000 }, null, 2));

  while (true) {
    const now = new Date();
    try {
      if (dailyPipelineEnabled) {
        for (const schedule of scheduleTimes) {
          const runDate = getScheduledRunDate(now);
          const dispatchKey = `${runDate}:${schedule.slot}`;
          if (shouldDispatchSchedule(dispatchedSlots, runDate, schedule.slot, isAtOrAfterSchedule(now, schedule.time))) {
            const job = await enqueuePipelineJob({
              jobType: "daily_content",
              runDate,
              scheduledSlot: schedule.slot,
              maxAttempts: 3,
              payload: { source: "scheduler_loop", scheduleTime: schedule.time, scheduledSlot: schedule.slot },
            });
            console.log(
              JSON.stringify(
                { scheduler: "daily_checked", jobId: job.id, runDate: job.run_date, scheduledSlot: job.scheduled_slot, status: job.status },
                null,
                2
              )
            );
            dispatchedSlots.add(dispatchKey);
          }
        }
      }
      const currentRunDate = getScheduledRunDate(now);
      for (const key of dispatchedSlots) {
        if (!key.startsWith(`${currentRunDate}:`)) {
          dispatchedSlots.delete(key);
        }
      }

      if (Date.now() - lastRetryAt >= retryEveryMs) {
        const requeued = await retryFailedJobsOnce(dailyPipelineEnabled);
        lastRetryAt = Date.now();
        console.log(JSON.stringify({ scheduler: "retry_checked", requeued }, null, 2));
      }
      if (Date.now() - lastQuarterCheckAt >= retryEveryMs) {
        const quarterlyEnqueued = await enqueueQuarterlyPlans(currentRunDate);
        lastQuarterCheckAt = Date.now();
        console.log(JSON.stringify({ scheduler: "quarterly_plan_checked", enqueued: quarterlyEnqueued }, null, 2));
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
