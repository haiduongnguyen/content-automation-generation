import { pool } from "../db/pool";
import { getRequiredArg, parsePositiveInt } from "./cliArgs";
import { runReelPrototype } from "../services/reels/reelPrototype";

async function main(): Promise<void> {
  const postId = parsePositiveInt(getRequiredArg("--post-id"), "post id");
  const result = await runReelPrototype(postId);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error("reels:prototype failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
