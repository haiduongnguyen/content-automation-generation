import fs from "node:fs";
import path from "node:path";

export function loadSqlFile(filename: string): string {
  const sqlPath = path.resolve(process.cwd(), "sql", filename);
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL file not found: ${sqlPath}`);
  }
  const raw = fs.readFileSync(sqlPath, "utf8");
  return raw.replace(/^\uFEFF/, "");
}
