export function getArgValue(name: string, args = process.argv.slice(2)): string | null {
  const index = args.indexOf(name);
  if (index < 0) {
    return null;
  }
  return args[index + 1] ?? null;
}

export function getRequiredArg(name: string, args = process.argv.slice(2)): string {
  const value = getArgValue(name, args);
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

export function parsePositiveInt(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

export function formatRows(rows: Array<Record<string, unknown>>, columns: string[]): string {
  if (rows.length === 0) {
    return "(no rows)";
  }
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length))
  );
  const header = columns.map((column, index) => column.padEnd(widths[index] ?? column.length)).join("  ");
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows
    .map((row) => columns.map((column, index) => String(row[column] ?? "").padEnd(widths[index] ?? column.length)).join("  "))
    .join("\n");
  return [header, divider, body].join("\n");
}
