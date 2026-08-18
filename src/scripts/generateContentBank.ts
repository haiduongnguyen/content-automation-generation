import fs from "node:fs";
import path from "node:path";
import { pool } from "../db/pool";
import { generatePostContent } from "../services/contentGenerator";
import { buildMessage } from "../services/publishMessage";
import { getVietnamDateString } from "../utils/dateTime";
import { getArgValue, parsePositiveInt } from "./cliArgs";

type TopicRow = {
  id: string;
  plan_date: string | null;
  scheduled_slot: string;
  topic: string;
  key_notes: string | null;
  topic_source: string | null;
  pillar_name: string | null;
};

type ContentBankItem = {
  index: number;
  generatedAt: string;
  planId: string;
  planDate: string | null;
  scheduledSlot: string;
  topic: string;
  keyNotes: string | null;
  topicSource: string | null;
  pillarName: string | null;
  operationKey: string;
  providerUsed: string;
  fallbackUsed: boolean;
  providerMetadata?: Record<string, unknown>;
  content: {
    title: string;
    body: string;
    cta: string;
    hashtags: string[];
    facebookMessage: string;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDateOnly(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}. Use YYYY-MM-DD.`);
  }
  return value;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "content_bank";
}

function readCompletedPlanIds(jsonlPath: string): Set<string> {
  const completed = new Set<string>();
  if (!fs.existsSync(jsonlPath)) {
    return completed;
  }
  const lines = fs.readFileSync(jsonlPath, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { planId?: unknown };
      if (typeof parsed.planId === "string" && parsed.planId.trim() !== "") {
        completed.add(parsed.planId);
      }
    } catch {
      // Ignore partial trailing lines from interrupted runs.
    }
  }
  return completed;
}

async function loadTopics(limit: number, fromDate: string): Promise<TopicRow[]> {
  const result = await pool.query<TopicRow>(
    `
    WITH ranked AS (
      SELECT
        cp.id::text,
        cp.plan_date::text,
        cp.scheduled_slot,
        cp.topic,
        cp.key_notes,
        cp.topic_source,
        p.name AS pillar_name,
        CASE WHEN cp.plan_date >= $2::date THEN 0 ELSE 1 END AS date_bucket,
        ROW_NUMBER() OVER (
          PARTITION BY lower(trim(cp.topic))
          ORDER BY
            CASE WHEN cp.plan_date >= $2::date THEN 0 ELSE 1 END,
            cp.plan_date NULLS LAST,
            cp.scheduled_slot,
            cp.id
        ) AS topic_rank
      FROM content_plan cp
      LEFT JOIN content_pillars p ON p.id = cp.pillar_id
      WHERE cp.is_active = TRUE
        AND cp.status = 'active'
        AND cp.topic IS NOT NULL
        AND trim(cp.topic) <> ''
    )
    SELECT id, plan_date, scheduled_slot, topic, key_notes, topic_source, pillar_name
    FROM ranked
    WHERE topic_rank = 1
    ORDER BY
      date_bucket,
      plan_date NULLS LAST,
      scheduled_slot,
      id
    LIMIT $1
    `,
    [limit, fromDate]
  );
  return result.rows;
}

function toMarkdown(item: ContentBankItem): string {
  return [
    `# ${item.index}. ${item.content.title}`,
    "",
    `- Topic: ${item.topic}`,
    `- Plan date: ${item.planDate ?? "n/a"}`,
    `- Slot: ${item.scheduledSlot}`,
    `- Provider: ${item.providerUsed}`,
    `- Prompt profile: ${String((item.providerMetadata?.promptProfile as { id?: string } | undefined)?.id ?? "unknown")}`,
    "",
    item.content.facebookMessage,
    "",
    "---",
    "",
  ].join("\n");
}

export async function generateContentBank(): Promise<void> {
  const limit = parsePositiveInt(getArgValue("--limit") ?? "100", "--limit");
  const sleepSeconds = parsePositiveInt(getArgValue("--sleep-seconds") ?? "15", "--sleep-seconds");
  const fromDate = parseDateOnly(getArgValue("--from-date") ?? getVietnamDateString(new Date()), "--from-date");
  const batchId = safeFilePart(getArgValue("--batch-id") ?? `content_bank_${fromDate}`);
  const outputDir = path.resolve(getArgValue("--output-dir") ?? path.join("storage", "content_bank", batchId));
  const jsonlPath = path.join(outputDir, "posts.jsonl");
  const markdownPath = path.join(outputDir, "posts.md");

  fs.mkdirSync(outputDir, { recursive: true });
  const completedPlanIds = readCompletedPlanIds(jsonlPath);
  const topics = await loadTopics(limit + completedPlanIds.size, fromDate);
  const pendingTopics = topics.filter((topic) => !completedPlanIds.has(topic.id)).slice(0, limit);

  console.log(
    JSON.stringify(
      {
        script: "generate_content_bank",
        batchId,
        outputDir,
        jsonlPath,
        markdownPath,
        requested: limit,
        alreadyCompleted: completedPlanIds.size,
        pending: pendingTopics.length,
        sleepSeconds,
      },
      null,
      2
    )
  );

  if (pendingTopics.length === 0) {
    return;
  }

  const jsonlStream = fs.createWriteStream(jsonlPath, { flags: "a" });
  const markdownStream = fs.createWriteStream(markdownPath, { flags: "a" });
  try {
    let index = completedPlanIds.size;
    for (const topic of pendingTopics) {
      index += 1;
      const operationKey = `content_bank:${batchId}:post_text:plan:${topic.id}`;
      console.log(JSON.stringify({ event: "content_bank_generate_started", index, planId: topic.id, topic: topic.topic }));
      const generated = await generatePostContent(topic.topic, operationKey);
      const item: ContentBankItem = {
        index,
        generatedAt: new Date().toISOString(),
        planId: topic.id,
        planDate: topic.plan_date,
        scheduledSlot: topic.scheduled_slot,
        topic: topic.topic,
        keyNotes: topic.key_notes,
        topicSource: topic.topic_source,
        pillarName: topic.pillar_name,
        operationKey,
        providerUsed: generated.providerUsed,
        fallbackUsed: generated.fallbackUsed,
        content: {
          ...generated.content,
          facebookMessage: buildMessage(generated.content),
        },
      };
      if (generated.providerMetadata) {
        item.providerMetadata = generated.providerMetadata;
      }
      jsonlStream.write(`${JSON.stringify(item)}\n`);
      markdownStream.write(toMarkdown(item));
      console.log(
        JSON.stringify({
          event: "content_bank_generate_completed",
          index,
          planId: topic.id,
          providerUsed: generated.providerUsed,
          cacheHit: Boolean(generated.providerMetadata?.cacheHit),
        })
      );
      if (index < completedPlanIds.size + pendingTopics.length) {
        await sleep(sleepSeconds * 1000);
      }
    }
  } finally {
    jsonlStream.end();
    markdownStream.end();
  }

  console.log(JSON.stringify({ script: "generate_content_bank", status: "completed", outputDir }, null, 2));
}

if (require.main === module) {
  generateContentBank()
    .catch((err) => {
      console.error("generate:content-bank failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
