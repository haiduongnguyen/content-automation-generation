import { loadConfig } from "../config/env";
import { pool } from "../db/pool";
import { parseScheduleTimes } from "./serverScheduler";
import { createGeminiTextProvider } from "./providers/text/geminiTextProvider";
import { findSimilarRecentTopic } from "./topicAutoGenerator";

export type QuarterRange = {
  key: string;
  start: string;
  end: string;
};

export type QuarterlyTopicItem = {
  planDate: string;
  scheduledSlot: string;
  pillarName: string;
  topic: string;
  keyNotes: string;
};

type Pillar = { id: string; name: string; description: string };

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

export function getQuarterRange(quarterKey: string): QuarterRange {
  const match = quarterKey.match(/^(\d{4})-Q([1-4])$/);
  if (!match) {
    throw new Error("Invalid quarter. Use YYYY-Q1..Q4.");
  }
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return { key: quarterKey, start: isoDate(start), end: isoDate(end) };
}

export function getQuarterKeyForDate(dateString: string): string {
  const [year, month] = dateString.split("-").map(Number);
  if (!year || !month) {
    throw new Error(`Invalid date: ${dateString}`);
  }
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

export function getQuarterKeysToEnsure(dateString: string, leadDays: number): string[] {
  const currentKey = getQuarterKeyForDate(dateString);
  const current = getQuarterRange(currentKey);
  const nextStart = addUtcDays(current.end, 1);
  const nextKey = getQuarterKeyForDate(nextStart);
  const daysUntilNext = Math.round(
    (new Date(`${nextStart}T00:00:00.000Z`).getTime() - new Date(`${dateString}T00:00:00.000Z`).getTime()) / 86_400_000
  );
  return daysUntilNext <= leadDays ? [currentKey, nextKey] : [currentKey];
}

export function enumerateQuarterSlots(range: QuarterRange, slots: string[], fromDate?: string): Array<{ planDate: string; scheduledSlot: string }> {
  const rows: Array<{ planDate: string; scheduledSlot: string }> = [];
  const firstDate = fromDate && fromDate > range.start ? fromDate : range.start;
  for (let date = firstDate; date <= range.end; date = addUtcDays(date, 1)) {
    for (const scheduledSlot of slots) {
      rows.push({ planDate: date, scheduledSlot });
    }
  }
  return rows;
}

export function parseQuarterlyTopicJson(raw: string, expected: Array<{ planDate: string; scheduledSlot: string }>): QuarterlyTopicItem[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as Array<Record<string, unknown>>;
  if (!Array.isArray(parsed) || parsed.length !== expected.length) {
    throw new Error(`Quarterly topic output must contain exactly ${expected.length} items.`);
  }
  const expectedKeys = new Set(expected.map((item) => `${item.planDate}:${item.scheduledSlot}`));
  const seen = new Set<string>();
  return parsed.map((item) => {
    const row: QuarterlyTopicItem = {
      planDate: String(item.plan_date ?? ""),
      scheduledSlot: String(item.scheduled_slot ?? ""),
      pillarName: String(item.pillar_name ?? ""),
      topic: String(item.topic ?? "").trim(),
      keyNotes: String(item.key_notes ?? "").trim(),
    };
    const key = `${row.planDate}:${row.scheduledSlot}`;
    if (!expectedKeys.has(key) || seen.has(key) || !row.pillarName || !row.topic || !row.keyNotes) {
      throw new Error(`Invalid or duplicate quarterly topic row: ${key}`);
    }
    seen.add(key);
    return row;
  });
}

function buildQuarterlyPrompt(args: {
  expected: Array<{ planDate: string; scheduledSlot: string }>;
  pillars: Pillar[];
  recentTopics: string[];
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    "Ban la content strategist cho kenh Facebook giao duc ve Toan, AI, Machine Learning va Data Science.",
    "Tra ve STRICT JSON array, khong markdown hay giai thich.",
    "Moi item co shape: {\"plan_date\":\"YYYY-MM-DD\",\"scheduled_slot\":\"...\",\"pillar_name\":\"...\",\"topic\":\"...\",\"key_notes\":\"...\"}.",
    "Phai tra ve dung mot item cho moi date/slot duoc yeu cau.",
    "Topic bang tieng Viet, cu the, khong trung y tuong trong batch hoac lich su.",
    "Can bang cac content pillar; morning de tiep can, evening co insight AI/ML sau hon.",
  ].join(" ");
  const userPrompt = [
    `Cac slot can lap ke hoach:\n${args.expected.map((row) => `${row.planDate} | ${row.scheduledSlot}`).join("\n")}`,
    `Content pillars:\n${args.pillars.map((p) => `${p.name}: ${p.description}`).join("\n")}`,
    `Topic phai tranh:\n${args.recentTopics.length > 0 ? args.recentTopics.map((topic) => `- ${topic}`).join("\n") : "Khong co"}`,
    "Moi key_notes la mot cau ngan neu ro goc khai thac. Khong chon topic rong nhu 'AI la gi'.",
  ].join("\n\n");
  return { systemPrompt, userPrompt };
}

function validateDistinct(items: QuarterlyTopicItem[], forbiddenTopics: string[], pillarNames: Set<string>): boolean {
  const accepted = [...forbiddenTopics];
  for (const item of items) {
    if (!pillarNames.has(item.pillarName) || findSimilarRecentTopic(item.topic, accepted, 0.75)) {
      return false;
    }
    accepted.push(item.topic);
  }
  return true;
}

async function fetchHistoricalTopics(start: string, lookbackDays: number): Promise<string[]> {
  const result = await pool.query<{ topic: string }>(
    `
    SELECT DISTINCT topic
    FROM content_plan
    WHERE is_active = TRUE
      AND topic IS NOT NULL
      AND BTRIM(topic) <> ''
      AND (plan_date IS NULL OR plan_date >= ($1::date - ($2::int * INTERVAL '1 day')))
      AND (plan_date IS NULL OR plan_date < $1::date)
    ORDER BY topic
    `,
    [start, lookbackDays]
  );
  return result.rows.map((row) => row.topic);
}

export async function generateQuarterlyTopicPlan(args: { quarterKey: string; fromDate?: string | undefined }): Promise<{
  quarterKey: string;
  batchId: number;
  topicCount: number;
}> {
  const cfg = loadConfig();
  const range = getQuarterRange(args.quarterKey);
  const slots = parseScheduleTimes(process.env.DAILY_PIPELINE_TIMES?.trim() || "09:00,21:00").map((item) => item.slot);
  const expected = enumerateQuarterSlots(range, slots, args.fromDate);
  if (expected.length === 0) {
    throw new Error(`No remaining slots for ${args.quarterKey}.`);
  }

  const pillarsResult = await pool.query<Pillar>(
    "SELECT id::text, name, description FROM content_pillars WHERE is_active = TRUE AND weight > 0 ORDER BY name"
  );
  const pillars = pillarsResult.rows;
  if (pillars.length === 0) {
    throw new Error("No active content pillars.");
  }
  const pillarNames = new Set(pillars.map((pillar) => pillar.name));
  const acceptedTopics = await fetchHistoricalTopics(expected[0]!.planDate, cfg.topicDuplicateLookbackDays);

  const batchResult = await pool.query<{ id: string; status: string }>(
    `
    INSERT INTO quarterly_topic_batches
      (quarter_key, quarter_start, quarter_end, scheduled_slots, status, expected_topic_count, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, 'generating', $5, NOW())
    ON CONFLICT (quarter_key)
    DO UPDATE SET
      quarter_start = EXCLUDED.quarter_start,
      quarter_end = EXCLUDED.quarter_end,
      scheduled_slots = EXCLUDED.scheduled_slots,
      expected_topic_count = EXCLUDED.expected_topic_count,
      status = CASE WHEN quarterly_topic_batches.status = 'active' THEN 'active' ELSE 'generating' END,
      error_message = NULL,
      updated_at = NOW()
    RETURNING id::text, status
    `,
    [range.key, range.start, range.end, JSON.stringify(slots), expected.length]
  );
  const batchId = Number(batchResult.rows[0]?.id);
  if (!batchId) {
    throw new Error("Could not create quarterly topic batch.");
  }
  if (batchResult.rows[0]?.status === "active") {
    const count = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM quarterly_topic_drafts WHERE batch_id = $1", [batchId]);
    return { quarterKey: range.key, batchId, topicCount: Number(count.rows[0]?.count ?? 0) };
  }

  try {
    await pool.query("DELETE FROM quarterly_topic_drafts WHERE batch_id = $1", [batchId]);
    for (let offset = 0; offset < expected.length; offset += slots.length * 14) {
      const window = expected.slice(offset, offset + slots.length * 14);
      const prompt = buildQuarterlyPrompt({ expected: window, pillars, recentTopics: acceptedTopics });
      const provider = createGeminiTextProvider(cfg);
      let items: QuarterlyTopicItem[] | null = null;
      let rejectedTopics: string[] = [];
      for (let semanticAttempt = 1; semanticAttempt <= 2; semanticAttempt += 1) {
        const validateOutput = (output: string) => {
          try {
            const parsed = parseQuarterlyTopicJson(output, window);
            return parsed.every((item) => pillarNames.has(item.pillarName));
          } catch {
            return false;
          }
        };
        const result = await provider.generate({
          topicName: `quarterly_topic:${range.key}`,
          systemPrompt: prompt.systemPrompt,
          userPrompt: [
            prompt.userPrompt,
            ...(rejectedTopics.length > 0
              ? [
                  `Output truoc bi tu choi vi trung topic. Tuyet doi khong lap lai cac topic sau:\n${rejectedTopics
                    .map((topic) => `- ${topic}`)
                    .join("\n")}`,
                ]
              : []),
          ].join("\n\n"),
          responseFormat: "json",
          operationKey: [
            `quarterly_topic:v2:${range.key}:${window[0]!.planDate}:${window[window.length - 1]!.planDate}`,
            ...(semanticAttempt > 1 ? [`semantic-retry:${semanticAttempt}`] : []),
          ].join(":"),
          operationType: "quarterly_topic",
          validateOutput,
        });
        const candidateItems = parseQuarterlyTopicJson(result.output, window);
        if (validateDistinct(candidateItems, acceptedTopics, pillarNames)) {
          items = candidateItems;
          break;
        }
        rejectedTopics = candidateItems.map((item) => item.topic);
      }
      if (!items) {
        throw new Error(`Quarterly topic batch contains duplicate topics at ${window[0]!.planDate}.`);
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const item of items) {
          const pillar = pillars.find((candidate) => candidate.name === item.pillarName);
          await client.query(
            `
            INSERT INTO quarterly_topic_drafts (batch_id, plan_date, scheduled_slot, pillar_id, topic, key_notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [batchId, item.planDate, item.scheduledSlot, Number(pillar!.id), item.topic, item.keyNotes]
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      acceptedTopics.push(...items.map((item) => item.topic));
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const draftCount = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM quarterly_topic_drafts WHERE batch_id = $1",
        [batchId]
      );
      if (Number(draftCount.rows[0]?.count ?? 0) !== expected.length) {
        throw new Error("Quarterly topic draft count does not match expected slots.");
      }
      await client.query(
        `
        INSERT INTO content_plan
          (day_no, plan_date, scheduled_slot, pillar_id, topic, key_notes, topic_source, status, is_active, quarterly_batch_id, updated_at)
        SELECT
          EXTRACT(DOY FROM d.plan_date)::int,
          d.plan_date,
          d.scheduled_slot,
          d.pillar_id,
          d.topic,
          d.key_notes,
          'generated',
          'active',
          TRUE,
          d.batch_id,
          NOW()
        FROM quarterly_topic_drafts d
        WHERE d.batch_id = $1
        ON CONFLICT (plan_date, scheduled_slot) WHERE plan_date IS NOT NULL
        DO UPDATE SET
          pillar_id = EXCLUDED.pillar_id,
          topic = EXCLUDED.topic,
          key_notes = EXCLUDED.key_notes,
          quarterly_batch_id = EXCLUDED.quarterly_batch_id,
          status = 'active',
          is_active = TRUE,
          updated_at = NOW()
        WHERE content_plan.topic_source = 'generated'
        `,
        [batchId]
      );
      await client.query(
        `
        UPDATE quarterly_topic_batches
        SET status = 'active', generated_topic_count = $2, activated_at = NOW(), updated_at = NOW()
        WHERE id = $1
        `,
        [batchId, expected.length]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return { quarterKey: range.key, batchId, topicCount: expected.length };
  } catch (err) {
    await pool.query(
      "UPDATE quarterly_topic_batches SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
      [batchId, err instanceof Error ? err.message : String(err)]
    );
    throw err;
  }
}

export async function isQuarterPlanActive(quarterKey: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM quarterly_topic_batches WHERE quarter_key = $1 AND status = 'active'", [quarterKey]);
  return result.rowCount === 1;
}
