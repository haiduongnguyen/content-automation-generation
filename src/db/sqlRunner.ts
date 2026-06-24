import { pool } from "./pool";
import { loadSqlFile } from "../sql/loader";

type ParamValue = string | number | boolean | null;

function stripLineComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

export function compileNamedQuery(sql: string, params: Record<string, ParamValue>) {
  const values: ParamValue[] = [];
  const keyIndex = new Map<string, number>();
  const cleanSql = stripLineComments(sql);

  const text = cleanSql.replace(/(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, key: string) => {
    if (!(key in params)) {
      throw new Error(`Missing SQL param: ${key}`);
    }
    if (!keyIndex.has(key)) {
      const value = params[key];
      if (value === undefined) {
        throw new Error(`Missing SQL param: ${key}`);
      }
      values.push(value);
      keyIndex.set(key, values.length);
    }
    return `$${keyIndex.get(key)}`;
  });

  return { text, values };
}

export async function queryManyFromFile<T = Record<string, unknown>>(
  sqlFile: string,
  params: Record<string, ParamValue> = {}
): Promise<T[]> {
  const sql = loadSqlFile(sqlFile);
  const compiled = compileNamedQuery(sql, params);
  const result = await pool.query(compiled.text, compiled.values);
  return result.rows as T[];
}

export async function queryOneFromFile<T = Record<string, unknown>>(
  sqlFile: string,
  params: Record<string, ParamValue> = {}
): Promise<T> {
  const rows = await queryManyFromFile<T>(sqlFile, params);
  if (rows.length === 0) {
    throw new Error(`No rows returned for ${sqlFile}`);
  }
  const first = rows[0];
  if (first === undefined) {
    throw new Error(`No rows returned for ${sqlFile}`);
  }
  return first;
}
