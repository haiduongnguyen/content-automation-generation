import { pool } from "../db/pool";
import { formatRows, getArgValue, parsePositiveInt } from "./cliArgs";
import { listReviewPosts } from "../services/operations/posts";

export async function runPostsReview(): Promise<void> {
  const limitArg = getArgValue("--limit");
  const limit = limitArg ? parsePositiveInt(limitArg, "limit") : 20;
  const posts = await listReviewPosts(limit);
  console.log(
    formatRows(
      posts.map((post) => ({
        id: post.id,
        run_date: post.run_date,
        slot: post.scheduled_slot,
        title: post.title ?? "",
        approval: post.approval_status,
        provider: post.provider_used ?? "",
        images: post.image_count,
      })),
      ["id", "run_date", "slot", "title", "approval", "provider", "images"]
    )
  );
}

if (require.main === module) {
  runPostsReview()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
