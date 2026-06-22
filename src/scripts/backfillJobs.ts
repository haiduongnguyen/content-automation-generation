import { pool } from "../db/pool";
import { getRequiredArg } from "./cliArgs";
import { enqueueBackfillJobs } from "../services/operations/backfill";

export async function runBackfillJobs(): Promise<void> {
  const from = getRequiredArg("--from");
  const to = getRequiredArg("--to");
  const summary = await enqueueBackfillJobs({ from, to });
  console.log(
    JSON.stringify(
      {
        from: summary.from,
        to: summary.to,
        count: summary.count,
        jobs: summary.jobs.map((job) => ({ id: job.id, runDate: job.run_date, status: job.status })),
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  runBackfillJobs()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
