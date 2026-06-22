import { getVietnamDateString } from "../utils/dateTime";

const SCHEDULE_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function parseScheduleTime(value: string): { hour: number; minute: number } {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error("Invalid schedule time. Use HH:mm.");
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("Invalid schedule time. Use HH:mm.");
  }
  return { hour, minute };
}

export function buildScheduleSlot(scheduleTime: string): string {
  const schedule = parseScheduleTime(scheduleTime);
  const period = schedule.hour < 12 ? "morning" : schedule.hour < 18 ? "afternoon" : "evening";
  return `${period}_${String(schedule.hour).padStart(2, "0")}${schedule.minute === 0 ? "" : String(schedule.minute).padStart(2, "0")}`;
}

export function parseScheduleTimes(value: string): Array<{ time: string; slot: string }> {
  const rawItems = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const items = rawItems.length > 0 ? rawItems : ["21:00"];
  const seenSlots = new Set<string>();
  return items.map((time) => {
    const slot = buildScheduleSlot(time);
    if (seenSlots.has(slot)) {
      throw new Error(`Duplicate schedule slot: ${slot}`);
    }
    seenSlots.add(slot);
    return { time, slot };
  });
}

export function getClockMinutesInScheduleTimeZone(now: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error("Could not resolve scheduler clock time.");
  }
  return hour * 60 + minute;
}

export function isAtOrAfterSchedule(now: Date, scheduleTime: string): boolean {
  const schedule = parseScheduleTime(scheduleTime);
  const currentMinutes = getClockMinutesInScheduleTimeZone(now);
  const scheduleMinutes = schedule.hour * 60 + schedule.minute;
  return currentMinutes >= scheduleMinutes;
}

export function getScheduledRunDate(now: Date): string {
  return getVietnamDateString(now);
}

export function secondsToMs(seconds: number): number {
  return Math.max(1, seconds) * 1000;
}
