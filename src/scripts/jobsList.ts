import { pool } from "../db/pool";
import { formatRows, getArgValue, parsePositiveInt } from "./cliArgs";
import { listPipelineJobs } from "../services/operations/jobs";

export async function runJobsList(): Promise<void> {
  const limitArg = getArgValue("--limit");
  const limit = limitArg ? parsePositiveInt(limitArg, "limit") : 20;
  const jobs = await listPipelineJobs(limit);
  console.log(
    formatRows(
      jobs.map((job) => ({
        id: job.id,
        type: job.job_type,
        run_date: job.run_date,
        slot: job.scheduled_slot,
        status: job.status,
        attempts: `${job.attempt_count}/${job.max_attempts}`,
        updated_at: job.updated_at,
      })),
      ["id", "type", "run_date", "slot", "status", "attempts", "updated_at"]
    )
  );
}

if (require.main === module) {
  runJobsList()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
