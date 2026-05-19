import { pool } from "../db/pool";
import { compileNamedQuery } from "../db/sqlRunner";
import { generateTopicPlan } from "../services/topicPlanGenerator";
import { loadSqlFile } from "../sql/loader";
import { getVietnamDateString } from "../utils/dateTime";

type BatchRow = { id: string };

function getArg(name: string, fallback = ""): string {
  const key = `--${name}=`;
  const hit = process.argv.find((x) => x.startsWith(key));
  if (hit) {
    return hit.slice(key.length).trim();
  }
  const idx = process.argv.findIndex((x) => x === `--${name}`);
  if (idx >= 0 && idx < process.argv.length - 1) {
    return process.argv[idx + 1].trim();
  }
  return fallback;
}

async function run(): Promise<void> {
  const broadTheme = getArg("theme");
  const audience = getArg("audience", "Vietnamese high-school students and technology university beginners");
  const language = getArg("language", "vi");
  const difficulty = getArg("difficulty", "beginner");
  const daysRaw = getArg("days", "100");
  const batchName = getArg("batch-name", `Plan ${getVietnamDateString(new Date())}`);
  const days = Number(daysRaw);

  if (!broadTheme) {
    throw new Error("Missing --theme");
  }
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("Invalid --days. Must be integer in range 1..365");
  }

  const plan = await generateTopicPlan({
    broadTheme,
    audience,
    days,
    language,
    difficulty,
  });

  const insertBatchSql = loadSqlFile("023_insert_plan_batch.sql");
  const insertDraftRowSql = loadSqlFile("024_insert_topic_plan_draft_row.sql");
  const client = await pool.connect();
  let batchId = 0;
  try {
    await client.query("BEGIN");
    const batchCompiled = compileNamedQuery(insertBatchSql, {
      name: batchName,
      broad_theme: broadTheme,
      audience,
      language,
      difficulty,
      total_days: days,
    });
    const batchRes = await client.query<BatchRow>(batchCompiled.text, batchCompiled.values);
    batchId = Number(batchRes.rows[0].id);

    for (const row of plan) {
      const rowCompiled = compileNamedQuery(insertDraftRowSql, {
        batch_id: batchId,
        day_no: row.day_no,
        topic: row.topic,
        key_notes: row.key_notes,
        status: "pending",
      });
      await client.query(rowCompiled.text, rowCompiled.values);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log(
    JSON.stringify(
      {
        batchId,
        batchName,
        totalDays: days,
        firstTopic: plan[0]?.topic ?? null,
        lastTopic: plan[plan.length - 1]?.topic ?? null,
      },
      null,
      2
    )
  );
}

run()
  .catch((err) => {
    console.error("plan:generate failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
