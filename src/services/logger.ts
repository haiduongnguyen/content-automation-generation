export type LogLevel = "info" | "warn" | "error";

export function writeLog(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function logInfo(message: string, fields?: Record<string, unknown>): void {
  writeLog("info", message, fields);
}

export function logWarn(message: string, fields?: Record<string, unknown>): void {
  writeLog("warn", message, fields);
}

export function logError(message: string, fields?: Record<string, unknown>): void {
  writeLog("error", message, fields);
}
