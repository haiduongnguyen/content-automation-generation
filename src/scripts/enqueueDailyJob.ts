import { pool } from "../db/pool";
import { enqueuePipelineJob, getTodayRunDate } from "../services/pipelineJobs";
import { buildScheduleSlot } from "../services/serverScheduler";

function getArg(name: string, fallback = ""): string {
  const key = `--${name}=`;
  const hit = process.argv.find((x) => x.startsWith(key));
  if (hit) {
    return hit.slice(key.length).trim();
  }
  const idx = process.argv.findIndex((x) => x === `--${name}`);
  if (idx >= 0 && idx < process.argv.length - 1) {
    return (process.argv[idx + 1] ?? fallback).trim();
  }
  return fallback;
}

export async function enqueueDailyJob(): Promise<void> {
  const runDate = getArg("run-date", getTodayRunDate());
  const scheduleTime = getArg("schedule-time", "");
  const scheduledSlot = getArg("scheduled-slot", scheduleTime ? buildScheduleSlot(scheduleTime) : "default");
  const job = await enqueuePipelineJob({
    jobType: "daily_content",
    runDate,
    scheduledSlot,
    maxAttempts: 3,
    payload: { source: "enqueue:daily", scheduledSlot, ...(scheduleTime ? { scheduleTime } : {}) },
  });

  console.log(
    JSON.stringify(
      {
        enqueued: true,
        id: job.id,
        jobType: job.job_type,
        runDate: job.run_date,
        scheduledSlot: job.scheduled_slot,
        status: job.status,
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  enqueueDailyJob()
    .catch((err) => {
      console.error("enqueue:daily failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
