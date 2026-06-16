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
