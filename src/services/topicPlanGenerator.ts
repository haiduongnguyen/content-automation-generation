import { loadConfig } from "../config/env";

export type TopicDraftItem = {
  day_no: number;
  topic: string;
  key_notes: string;
};

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function extractOutputText(payload: ResponsesPayload): string {
  if (payload.output_text && payload.output_text.trim() !== "") {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim() !== "") {
        parts.push(content.text.trim());
      }
    }
  }
  return parts.join("\n").trim();
}

export function parseTopicPlanJson(raw: string, expectedDays: number): TopicDraftItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Plan output is not valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Plan output must be a JSON array.");
  }
  if (parsed.length !== expectedDays) {
    throw new Error(`Plan output must contain exactly ${expectedDays} items.`);
  }

  const used = new Set<number>();
  const rows: TopicDraftItem[] = [];
  for (const item of parsed) {
    const obj = item as Record<string, unknown>;
    const dayNo = Number(obj.day_no);
    const topic = String(obj.topic ?? "").trim();
    const keyNotes = String(obj.key_notes ?? "").trim();

    if (!Number.isInteger(dayNo) || dayNo < 1 || dayNo > expectedDays) {
      throw new Error(`Invalid day_no: ${obj.day_no}`);
    }
    if (used.has(dayNo)) {
      throw new Error(`Duplicate day_no: ${dayNo}`);
    }
    if (!topic) {
      throw new Error(`Missing topic at day_no ${dayNo}`);
    }
    if (!keyNotes) {
      throw new Error(`Missing key_notes at day_no ${dayNo}`);
    }
    used.add(dayNo);
    rows.push({ day_no: dayNo, topic, key_notes: keyNotes });
  }

  rows.sort((a, b) => a.day_no - b.day_no);
  return rows;
}

export async function generateTopicPlan(params: {
  broadTheme: string;
  audience: string;
  days: number;
  language: string;
  difficulty: string;
}): Promise<TopicDraftItem[]> {
  const cfg = loadConfig();

  const systemPrompt = [
    "You design educational content plans for math, AI, ML, and data science learning.",
    "Return STRICT JSON array only.",
    "Each item shape: {\"day_no\": number, \"topic\": string, \"key_notes\": string}.",
    "No markdown, no explanations, no extra keys.",
    `Generate exactly ${params.days} items, day_no from 1..${params.days}.`,
    "Topics must be progressive, non-duplicate, practical for social content.",
  ].join(" ");

  const userPrompt = [
    `Broad theme: ${params.broadTheme}`,
    `Audience: ${params.audience}`,
    `Language: ${params.language}`,
    `Difficulty: ${params.difficulty}`,
    `Total days: ${params.days}`,
    "Each key_notes should be one concise line describing what to cover.",
  ].join("\n");

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: cfg.openAiModel,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
      text: { format: { type: "text" } },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI plan generation failed: HTTP ${resp.status} ${errText}`);
  }

  const payload = (await resp.json()) as ResponsesPayload;
  const text = extractOutputText(payload);
  if (!text) {
    throw new Error("OpenAI plan generation returned empty output.");
  }
  return parseTopicPlanJson(text, params.days);
}
