import { enqueuePipelineJob, type PipelineJobRow } from "../pipelineJobs";

export type BackfillSummary = {
  from: string;
  to: string;
  count: number;
  jobs: PipelineJobRow[];
};

export function parseDateOnly(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD.`);
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD.`);
  }
  return trimmed;
}

export function enumerateDateRange(from: string, to: string, maxDays = 31): string[] {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (startDate > endDate) {
    throw new Error("Backfill from date must be before or equal to to date.");
  }

  const dates: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    if (dates.length > maxDays) {
      throw new Error(`Backfill range is too large. Maximum is ${maxDays} days.`);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function enqueueBackfillJobs(args: { from: string; to: string; maxDays?: number }): Promise<BackfillSummary> {
  const dates = enumerateDateRange(args.from, args.to, args.maxDays ?? 31);
  const jobs: PipelineJobRow[] = [];
  for (const runDate of dates) {
    const job = await enqueuePipelineJob({
      jobType: "daily_content",
      runDate,
      maxAttempts: 3,
      payload: { source: "backfill", from: args.from, to: args.to },
    });
    jobs.push(job);
  }
  return { from: dates[0] ?? args.from, to: dates[dates.length - 1] ?? args.to, count: jobs.length, jobs };
}
