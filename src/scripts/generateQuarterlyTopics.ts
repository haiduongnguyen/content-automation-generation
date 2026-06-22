import { pool } from "../db/pool";
import { getVietnamDateString } from "../utils/dateTime";
import { generateQuarterlyTopicPlan, getQuarterKeyForDate, getQuarterRange } from "../services/quarterlyTopicPlan";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export async function runGenerateQuarterlyTopics(args: { quarterKey: string; fromDate?: string | undefined }) {
  return generateQuarterlyTopicPlan(args);
}

if (require.main === module) {
  const today = getVietnamDateString(new Date());
  const quarterKey = getArg("quarter") || getQuarterKeyForDate(today);
  const range = getQuarterRange(quarterKey);
  const requestedFrom = getArg("from");
  const fromDate = requestedFrom || (today >= range.start && today <= range.end ? today : undefined);
  runGenerateQuarterlyTopics({ quarterKey, fromDate })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.error("topics:quarter failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
