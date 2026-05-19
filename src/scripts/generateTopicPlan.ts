import { pool } from "../db/pool";
import { queryOneFromFile } from "../db/sqlRunner";
import { generateTopicPlan } from "../services/topicPlanGenerator";

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
  const batchName = getArg("batch-name", `Plan ${new Date().toISOString().slice(0, 10)}`);
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

  const batch = await queryOneFromFile<BatchRow>("023_insert_plan_batch.sql", {
    name: batchName,
    broad_theme: broadTheme,
    audience,
    language,
    difficulty,
    total_days: days,
  });

  for (const row of plan) {
    await queryOneFromFile("024_insert_topic_plan_draft_row.sql", {
      batch_id: Number(batch.id),
      day_no: row.day_no,
      topic: row.topic,
      key_notes: row.key_notes,
      status: "pending",
    });
  }

  console.log(
    JSON.stringify(
      {
        batchId: Number(batch.id),
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
