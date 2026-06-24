import { pool } from "../db/pool";
import { formatRows, getRequiredArg, parsePositiveInt } from "./cliArgs";
import { getPipelineJobDetails } from "../services/operations/jobs";

export async function runJobsShow(): Promise<void> {
  const id = parsePositiveInt(getRequiredArg("--id"), "job id");
  const details = await getPipelineJobDetails(id);
  if (!details) {
    throw new Error(`Pipeline job not found: ${id}`);
  }

  console.log(JSON.stringify(details.job, null, 2));
  console.log("\nEvents:");
  console.log(
    formatRows(
      details.events.map((event) => ({
        id: event.id,
        event_type: event.event_type,
        message: event.message ?? "",
        created_at: event.created_at,
      })),
      ["id", "event_type", "message", "created_at"]
    )
  );
  console.log("\nContent jobs:");
  console.log(formatRows(details.contentJobs, ["id", "run_date", "status", "error_message"]));
  console.log("\nPosts:");
  console.log(formatRows(details.posts, ["id", "job_id", "title", "approval_status", "created_at"]));
}

if (require.main === module) {
  runJobsShow()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
