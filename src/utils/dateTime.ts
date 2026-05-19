export function formatDateInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

export function getVietnamDateString(date = new Date()): string {
  return formatDateInTimeZone(date, "Asia/Ho_Chi_Minh");
}
