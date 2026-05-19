import { pool } from "../db/pool";
import { getVietnamDateString } from "../utils/dateTime";

export type PlannedTopic = {
  topicName: string;
  dayNo: number;
};

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
    return {
      topicName: byDate.rows[0].topic,
      dayNo: byDate.rows[0].day_no,
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

  if (result.rows.length === 0) {
    return null;
  }

  return {
    topicName: result.rows[0].topic,
    dayNo: result.rows[0].day_no,
  };
}
