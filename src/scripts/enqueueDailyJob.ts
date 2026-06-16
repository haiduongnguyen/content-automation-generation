import { pool } from "../db/pool";
import { enqueuePipelineJob, getTodayRunDate } from "../services/pipelineJobs";

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
  const job = await enqueuePipelineJob({
    jobType: "daily_content",
    runDate,
    maxAttempts: 3,
    payload: { source: "enqueue:daily" },
  });

  console.log(
    JSON.stringify(
      {
        enqueued: true,
        id: job.id,
        jobType: job.job_type,
        runDate: job.run_date,
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
