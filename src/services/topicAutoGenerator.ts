import { loadConfig } from "../config/env";
import { pool } from "../db/pool";
import { getVietnamDateString } from "../utils/dateTime";
import { resolvePlanDayNo, type PlannedTopic } from "./contentPlan";
import { createGeminiTextProvider } from "./providers/text/geminiTextProvider";

type PillarRow = {
  id: string;
  name: string;
  description: string;
};

type GeneratedTopicPayload = {
  topic?: unknown;
  key_notes?: unknown;
};

export const TOPIC_GENERATION_SYSTEM_PROMPT = [
  "Ban la content strategist cho kenh Facebook giao duc ve Toan, AI, Machine Learning va Data Science.",
  "Nhiem vu: sinh 1 topic cu the cho mot bai post Facebook ngan, de hieu, thuc dung.",
  "Doi tuong doc: hoc sinh THPT, sinh vien ky thuat/cong nghe, nguoi moi hoc AI/Data, nguoi tung so Toan.",
  "Bat buoc tra ve STRICT JSON object, khong markdown, khong giai thich.",
  "Shape duy nhat: {\"topic\":\"...\",\"key_notes\":\"...\"}.",
  "Topic phai bang tieng Viet, cu the, khong trung y tuong voi danh sach gan day.",
  "Key_notes la 1 cau ngan noi ro goc khai thac bai viet.",
].join(" ");

export function buildTopicGenerationUserPrompt(params: {
  runDate: string;
  scheduledSlot: string;
  pillarName: string;
  pillarDescription: string;
  duplicateLookbackDays: number;
  recentTopics: string[];
}): string {
  const recent = params.recentTopics.length > 0 ? params.recentTopics.map((topic, idx) => `${idx + 1}. ${topic}`).join("\n") : "Khong co.";
  return [
    `Ngay dang bai: ${params.runDate}`,
    `Slot dang bai: ${params.scheduledSlot}`,
    `Content pillar: ${params.pillarName}`,
    `Mo ta pillar: ${params.pillarDescription}`,
    `Can tranh trung trong ${params.duplicateLookbackDays} ngay gan nhat:`,
    recent,
    "Yeu cau topic:",
    "- Phai khac ro rang ve y tuong, vi du, cong thuc, ung dung hoac goc nhin so voi danh sach tren.",
    "- Uu tien topic co the viet thanh bai Facebook gan gui trong 500-900 tu.",
    "- Khong chon topic qua rong nhu 'AI la gi' hay 'Toan hoc trong AI'.",
    "- Khong lap lai Gradient descent neu danh sach gan day da co.",
    "- Neu slot la morning_09, uu tien topic de vao ngay, co vi du gan doi song.",
    "- Neu slot la evening_21, uu tien topic sau hon mot chut, co insight hoac ung dung AI/ML ro hon.",
  ].join("\n");
}

function parseGeneratedTopic(raw: string): { topic: string; keyNotes: string } {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let parsed: GeneratedTopicPayload;
  try {
    parsed = JSON.parse(cleaned) as GeneratedTopicPayload;
  } catch {
    throw new Error("Generated topic output is not valid JSON.");
  }

  const topic = String(parsed.topic ?? "").trim();
  const keyNotes = String(parsed.key_notes ?? "").trim();
  if (!topic) {
    throw new Error("Generated topic missing topic.");
  }
  if (!keyNotes) {
    throw new Error("Generated topic missing key_notes.");
  }
  return { topic, keyNotes };
}

export function normalizeTopicForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function topicSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeTopicForComparison(left);
  const normalizedRight = normalizeTopicForComparison(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }
  if (normalizedLeft === normalizedRight) {
    return 1;
  }
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return Math.min(normalizedLeft.length, normalizedRight.length) / Math.max(normalizedLeft.length, normalizedRight.length);
  }
  const leftTokens = new Set(normalizedLeft.split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(normalizedRight.split(" ").filter((token) => token.length > 2));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const tokenScore = union === 0 ? 0 : intersection / union;
  const toBigrams = (tokens: string[]) =>
    new Set(tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`));
  const leftBigrams = toBigrams(normalizedLeft.split(" "));
  const rightBigrams = toBigrams(normalizedRight.split(" "));
  const sharesBigram = [...leftBigrams].some((bigram) => rightBigrams.has(bigram));
  return sharesBigram ? Math.max(tokenScore, 0.65) : tokenScore;
}

export function findSimilarRecentTopic(candidate: string, recentTopics: string[], threshold = 0.6): string | null {
  return recentTopics.find((topic) => topicSimilarity(candidate, topic) >= threshold) ?? null;
}

async function pickPillar(): Promise<PillarRow> {
  const result = await pool.query<PillarRow>(
    `
    SELECT id::text, name, description
    FROM content_pillars
    WHERE is_active = TRUE
      AND weight > 0
    ORDER BY -LN(GREATEST(random(), 0.000001)) / weight
    LIMIT 1
    `
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("No active content pillar available for topic generation.");
  }
  return row;
}

async function fetchRecentTopicTexts(runDate: string, scheduledSlot: string, lookbackDays: number): Promise<string[]> {
  const result = await pool.query<{ text: string }>(
    `
    WITH recent_plan AS (
      SELECT topic AS text, plan_date AS activity_date
      FROM content_plan
      WHERE is_active = TRUE
        AND plan_date IS NOT NULL
        AND plan_date >= ($1::date - ($3::int * INTERVAL '1 day'))
        AND plan_date <= $1::date
        AND NOT (plan_date = $1::date AND scheduled_slot = $2)
    ),
    recent_posts AS (
      SELECT COALESCE(NULLIF(p.title, ''), LEFT(p.body, 140)) AS text, cj.run_date AS activity_date
      FROM posts p
      JOIN content_jobs cj ON cj.id = p.job_id
      WHERE cj.run_date >= ($1::date - ($3::int * INTERVAL '1 day'))
        AND cj.run_date <= $1::date
        AND NOT (cj.run_date = $1::date AND cj.scheduled_slot = $2)
    )
    SELECT text
    FROM (
      SELECT text, MAX(activity_date) AS latest_activity_date
      FROM (
        SELECT text, activity_date FROM recent_plan
        UNION ALL
        SELECT text, activity_date FROM recent_posts
      ) history
      WHERE text IS NOT NULL
        AND BTRIM(text) <> ''
      GROUP BY text
    ) x
    ORDER BY latest_activity_date DESC, text ASC
    `,
    [runDate, scheduledSlot, lookbackDays]
  );
  return result.rows.map((row) => row.text);
}

export async function generateAndStoreTopicForSlot(params: { date: Date; scheduledSlot: string }): Promise<PlannedTopic> {
  const cfg = loadConfig();
  const runDate = getVietnamDateString(params.date);
  const dayNo = resolvePlanDayNo(params.date);
  const pillar = await pickPillar();
  const recentTopics = await fetchRecentTopicTexts(runDate, params.scheduledSlot, cfg.topicDuplicateLookbackDays);
  const provider = createGeminiTextProvider(cfg);
  const userPrompt = buildTopicGenerationUserPrompt({
    runDate,
    scheduledSlot: params.scheduledSlot,
    pillarName: pillar.name,
    pillarDescription: pillar.description,
    duplicateLookbackDays: cfg.topicDuplicateLookbackDays,
    recentTopics,
  });

  let generated: { topic: string; keyNotes: string } | null = null;
  const rejectedTopics: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await provider.generate({
      topicName: "topic_generation",
      systemPrompt: TOPIC_GENERATION_SYSTEM_PROMPT,
      userPrompt: [
        userPrompt,
        ...(rejectedTopics.length > 0
          ? [`Cac topic vua bi tu choi vi qua giong lich su, khong duoc lap lai:\n${rejectedTopics.join("\n")}`]
          : []),
      ].join("\n\n"),
      responseFormat: "json",
    });
    const candidate = parseGeneratedTopic(result.output);
    const similarTopic = findSimilarRecentTopic(candidate.topic, recentTopics);
    if (!similarTopic) {
      generated = candidate;
      break;
    }
    rejectedTopics.push(`- ${candidate.topic} (giong: ${similarTopic})`);
  }
  if (!generated) {
    throw new Error("Gemini could not generate a sufficiently distinct topic after 3 attempts.");
  }

  const inserted = await pool.query<{
    id: string;
    topic: string;
    day_no: number;
    key_notes: string | null;
    topic_source: string;
    pillar_name: string | null;
  }>(
    `
    INSERT INTO content_plan (day_no, plan_date, scheduled_slot, pillar_id, topic, key_notes, topic_source, status, is_active, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'generated', 'active', TRUE, NOW())
    ON CONFLICT (plan_date, scheduled_slot)
    WHERE plan_date IS NOT NULL
    DO UPDATE SET
      pillar_id = EXCLUDED.pillar_id,
      topic = EXCLUDED.topic,
      key_notes = EXCLUDED.key_notes,
      topic_source = 'generated',
      status = 'active',
      is_active = TRUE,
      updated_at = NOW()
    RETURNING id::text, topic, day_no, key_notes, topic_source, $7::text AS pillar_name
    `,
    [dayNo, runDate, params.scheduledSlot, Number(pillar.id), generated.topic, generated.keyNotes, pillar.name]
  );

  const row = inserted.rows[0];
  if (!row) {
    throw new Error("Generated topic was not stored.");
  }
  return {
    id: row.id,
    topicName: row.topic,
    dayNo: row.day_no,
    keyNotes: row.key_notes,
    topicSource: row.topic_source,
    pillarName: row.pillar_name,
  };
}
