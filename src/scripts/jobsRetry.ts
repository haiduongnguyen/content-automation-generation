import { pool } from "../db/pool";
import { getRequiredArg, parsePositiveInt } from "./cliArgs";
import { retryPipelineJobById } from "../services/operations/jobs";

export async function runJobsRetry(): Promise<void> {
  const id = parsePositiveInt(getRequiredArg("--id"), "job id");
  const job = await retryPipelineJobById(id);
  console.log(JSON.stringify({ requeued: true, jobId: job.id, status: job.status }, null, 2));
}

if (require.main === module) {
  runJobsRetry()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
