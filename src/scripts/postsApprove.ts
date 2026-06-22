import { pool } from "../db/pool";
import { getRequiredArg, parsePositiveInt } from "./cliArgs";
import { approvePost } from "../services/operations/posts";

export async function runPostsApprove(): Promise<void> {
  const id = parsePositiveInt(getRequiredArg("--id"), "post id");
  const post = await approvePost(id);
  console.log(JSON.stringify({ approved: true, postId: post.id, status: post.approval_status }, null, 2));
}

if (require.main === module) {
  runPostsApprove()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
