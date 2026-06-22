import { pool } from "../db/pool";
import { runGenerationPipeline, type GenerateOnceResult } from "../services/generationPipeline";

export type { GenerateOnceResult };

export async function runGenerateOnce(options: { runDate?: string; scheduledSlot?: string } = {}): Promise<GenerateOnceResult> {
  const result = await runGenerationPipeline(options);
  console.log(JSON.stringify(result.status === "skipped" ? { ...result, skipped: true, existingPostId: result.postId } : result, null, 2));
  return result;
}

if (require.main === module) {
  runGenerateOnce()
    .catch((err) => {
      console.error("generate:once failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
