import { pool } from "../db/pool";
import { getVietnamDateString } from "../utils/dateTime";

export type PlannedTopic = {
  topicName: string;
  dayNo: number;
};

export type FallbackTopic = {
  id: string | number;
  name: string;
};

export type ChosenTopic = {
  topicName: string;
  topicId: number | null;
  plannedDayNo: number | null;
};

export function chooseTopic(planned: PlannedTopic | null, fallback: FallbackTopic | null): ChosenTopic {
  if (planned) {
    return {
      topicName: planned.topicName,
      topicId: null,
      plannedDayNo: planned.dayNo,
    };
  }
  if (!fallback) {
    throw new Error("No planned topic or fallback topic available.");
  }
  return {
    topicName: fallback.name,
    topicId: Number(fallback.id),
    plannedDayNo: null,
  };
}

export function resolvePlanDayNo(date: Date): number {
  const dayOfMonth = date.getDate();
  return ((dayOfMonth - 1) % 30) + 1;
}

export async function pickPlannedTopic(date: Date): Promise<PlannedTopic | null> {
  const dayNo = resolvePlanDayNo(date);
  const today = getVietnamDateString(date);

  const byDate = await pool.query<{ topic: string; day_no: number }>(
    `
    SELECT topic, day_no
    FROM content_plan
    WHERE is_active = TRUE
      AND plan_date = $1
    LIMIT 1
    `,
    [today]
  );

  if (byDate.rows.length > 0) {
    const row = byDate.rows[0];
    if (!row) {
      return null;
    }
    return {
      topicName: row.topic,
      dayNo: row.day_no,
    };
  }

  const result = await pool.query<{ topic: string; day_no: number }>(
    `
    SELECT topic, day_no
    FROM content_plan
    WHERE is_active = TRUE
      AND day_no = $1
    LIMIT 1
    `,
    [dayNo]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    topicName: row.topic,
    dayNo: row.day_no,
  };
}
