import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/env";
import { pool } from "../db/pool";
import { loadSqlFile } from "../sql/loader";

type PlanRow = {
  dayNo: number;
  topic: string;
  keyNotes: string;
};

function parseDayNo(raw: string): number {
  const m = raw.trim().match(/^Day\s+(\d+)$/i);
  if (!m) {
    throw new Error(`Invalid Day format: ${raw}`);
  }
  return Number(m[1]);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cur += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(csvText: string): PlanRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    throw new Error("CSV has no data rows.");
  }
  const rows: PlanRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    if (cols.length < 3) {
      throw new Error(`Invalid CSV row: ${line}`);
    }
    const dayCol = cols[0];
    const topicCol = cols[1];
    if (!dayCol || !topicCol) {
      throw new Error(`Invalid CSV row: ${line}`);
    }
    rows.push({
      dayNo: parseDayNo(dayCol),
      topic: topicCol,
      keyNotes: cols.slice(2).join(","),
    });
  }
  return rows;
}

async function run(): Promise<void> {
  await pool.query(loadSqlFile("016_create_content_plan.sql"));
  await pool.query(loadSqlFile("017_add_plan_date_to_content_plan.sql"));

  const cfg = loadConfig();
  const planStart = new Date(`${cfg.planStartDate}T00:00:00`);
  if (Number.isNaN(planStart.getTime())) {
    throw new Error(`Invalid PLAN_START_DATE: ${cfg.planStartDate}`);
  }

  const csvPath = path.resolve(process.cwd(), "ke_hoach_30_ngay.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const csvText = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(csvText);

  for (const row of rows) {
    const planDate = new Date(planStart);
    planDate.setDate(planStart.getDate() + (row.dayNo - 1));
    const planDateStr = planDate.toISOString().slice(0, 10);

    await pool.query(
      `
      INSERT INTO content_plan (day_no, plan_date, topic, key_notes, is_active, updated_at)
      VALUES ($1, $2, $3, $4, true, NOW())
      ON CONFLICT (day_no)
      DO UPDATE SET
        plan_date = EXCLUDED.plan_date,
        topic = EXCLUDED.topic,
        key_notes = EXCLUDED.key_notes,
        is_active = true,
        updated_at = NOW()
      `,
      [row.dayNo, planDateStr, row.topic, row.keyNotes]
    );
  }

  console.log(JSON.stringify({ imported: rows.length }, null, 2));
}

run()
  .catch((err) => {
    console.error("import:content-plan failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
