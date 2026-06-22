import { pool } from "../db/pool";
import { getVietnamDateString } from "../utils/dateTime";

export type PlannedTopic = {
  id?: string;
  topicName: string;
  dayNo: number;
  keyNotes?: string | null;
  topicSource?: string;
  pillarName?: string | null;
};

export type FallbackTopic = {
  id: string | number;
  name: string;
};

export type ChosenTopic = {
  topicName: string;
  topicId: number | null;
  plannedDayNo: number | null;
  plannedTopicId?: number | null;
  keyNotes?: string | null;
  topicSource?: string;
  pillarName?: string | null;
};

export function chooseTopic(planned: PlannedTopic | null, fallback: FallbackTopic | null): ChosenTopic {
  if (planned) {
    return {
      topicName: planned.topicName,
      topicId: null,
      plannedDayNo: planned.dayNo,
      plannedTopicId: planned.id ? Number(planned.id) : null,
      keyNotes: planned.keyNotes ?? null,
      topicSource: planned.topicSource ?? "manual",
      pillarName: planned.pillarName ?? null,
    };
  }
  if (!fallback) {
    throw new Error("No planned topic or fallback topic available.");
  }
  return {
    topicName: fallback.name,
    topicId: Number(fallback.id),
    plannedDayNo: null,
    plannedTopicId: null,
    keyNotes: null,
    topicSource: "fallback_topics",
    pillarName: null,
  };
}

export function resolvePlanDayNo(date: Date): number {
  const dayOfMonth = date.getDate();
  return ((dayOfMonth - 1) % 30) + 1;
}

export async function pickPlannedTopic(date: Date, scheduledSlot = "default"): Promise<PlannedTopic | null> {
  const dayNo = resolvePlanDayNo(date);
  const today = getVietnamDateString(date);

  const byDate = await pool.query<{ id: string; topic: string; day_no: number; key_notes: string | null; topic_source: string; pillar_name: string | null }>(
    `
    SELECT cp.id::text, cp.topic, cp.day_no, cp.key_notes, cp.topic_source, p.name AS pillar_name
    FROM content_plan cp
    LEFT JOIN content_pillars p ON p.id = cp.pillar_id
    WHERE cp.is_active = TRUE
      AND cp.status = 'active'
      AND plan_date = $1
      AND scheduled_slot = $2
    LIMIT 1
    `,
    [today, scheduledSlot]
  );

  if (byDate.rows.length > 0) {
    const row = byDate.rows[0];
    if (!row) {
      return null;
    }
    return {
      topicName: row.topic,
      dayNo: row.day_no,
      id: row.id,
      keyNotes: row.key_notes,
      topicSource: row.topic_source,
      pillarName: row.pillar_name,
    };
  }

  const result = await pool.query<{ id: string; topic: string; day_no: number; key_notes: string | null; topic_source: string; pillar_name: string | null }>(
    `
    SELECT cp.id::text, cp.topic, cp.day_no, cp.key_notes, cp.topic_source, p.name AS pillar_name
    FROM content_plan cp
    LEFT JOIN content_pillars p ON p.id = cp.pillar_id
    WHERE cp.is_active = TRUE
      AND cp.status = 'active'
      AND day_no = $1
      AND scheduled_slot = $2
    LIMIT 1
    `,
    [dayNo, scheduledSlot]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    topicName: row.topic,
    dayNo: row.day_no,
    id: row.id,
    keyNotes: row.key_notes,
    topicSource: row.topic_source,
    pillarName: row.pillar_name,
  };
}
