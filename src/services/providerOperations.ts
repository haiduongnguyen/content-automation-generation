import { createHash } from "node:crypto";
import { pool } from "../db/pool";
import type { ProviderResult } from "./providers/types";

export type ProviderOperationType = "quarterly_topic" | "post_text" | "post_image";

type OperationRow = {
  status: string;
  result_json: ProviderResult<unknown> | null;
  attempt_count: number;
  request_hash: string;
  error_message: string | null;
};

export function selectProviderOperationKey(args: {
  baseOperationKey: string;
  operationType: ProviderOperationType;
  maxAttempts: number;
  family: Array<{ operation_key: string; attempt_count: number }>;
}): string {
  const resumable = args.family.find((candidate) => Number(candidate.attempt_count) < args.maxAttempts);
  if (resumable) {
    return resumable.operation_key;
  }
  if (args.family.length > 0 && args.operationType === "quarterly_topic") {
    return `${args.baseOperationKey}:retry:${args.family.length}`;
  }
  return args.family[0]?.operation_key ?? args.baseOperationKey;
}

export function hashProviderRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function usageFromResult(result: ProviderResult<unknown>): {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
} {
  const usage = (result.metadata?.usage ?? {}) as Record<string, unknown>;
  const numberOrNull = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    inputTokens: numberOrNull(usage.inputTokens),
    outputTokens: numberOrNull(usage.outputTokens),
    totalTokens: numberOrNull(usage.totalTokens),
    cachedTokens: numberOrNull(usage.cachedTokens),
  };
}

export async function runCachedProviderOperation<T>(args: {
  operationKey?: string | undefined;
  operationType?: ProviderOperationType | undefined;
  provider: string;
  model: string;
  requestHash: string;
  maxAttempts: number;
  execute: () => Promise<ProviderResult<T>>;
}): Promise<ProviderResult<T>> {
  if (!args.operationKey || !args.operationType) {
    return runWithAttempts(args.execute, args.maxAttempts);
  }

  const client = await pool.connect();
  const baseOperationKey = args.operationKey;
  let operationKey = baseOperationKey;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [baseOperationKey]);
    const family = await client.query<OperationRow & { operation_key: string }>(
      `
      SELECT operation_key, status, result_json, attempt_count, request_hash, error_message
      FROM provider_operations
      WHERE (operation_key = $1 OR operation_key LIKE $1 || ':retry:%')
        AND request_hash = $2
      ORDER BY id DESC
      `,
      [baseOperationKey, args.requestHash]
    );
    const completed = family.rows.find((candidate) => candidate.status === "completed" && candidate.result_json);
    if (completed?.result_json) {
      await client.query(
        "UPDATE provider_operations SET cache_hit_count = cache_hit_count + 1, updated_at = NOW() WHERE operation_key = $1",
        [completed.operation_key]
      );
      const cached = completed.result_json as ProviderResult<T>;
      return {
        ...cached,
        metadata: { ...(cached.metadata ?? {}), cacheHit: true, operationKey: completed.operation_key },
      };
    }
    operationKey = selectProviderOperationKey({
      baseOperationKey,
      operationType: args.operationType,
      maxAttempts: args.maxAttempts,
      family: family.rows,
    });
    await client.query(
      `
      INSERT INTO provider_operations (operation_key, operation_type, provider, model, request_hash)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (operation_key) DO NOTHING
      `,
      [operationKey, args.operationType, args.provider, args.model, args.requestHash]
    );
    const existing = await client.query<OperationRow>(
      "SELECT status, result_json, attempt_count, request_hash, error_message FROM provider_operations WHERE operation_key = $1",
      [operationKey]
    );
    const row = existing.rows[0];
    if (row && row.request_hash !== args.requestHash) {
      throw new Error(`Provider operation key reused with a different request: ${operationKey}`);
    }
    if (row && Number(row.attempt_count) >= args.maxAttempts) {
      throw new Error(row.error_message || `Provider operation exhausted ${args.maxAttempts} attempts: ${operationKey}`);
    }

    await client.query(
      `
      UPDATE provider_operations
      SET status = 'running', error_message = NULL, started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE operation_key = $1
      `,
      [operationKey]
    );

    let lastError: unknown;
    const remainingAttempts = Math.max(0, args.maxAttempts - Number(row?.attempt_count ?? 0));
    for (let attempt = 1; attempt <= remainingAttempts; attempt += 1) {
      await client.query(
        "UPDATE provider_operations SET attempt_count = attempt_count + 1, updated_at = NOW() WHERE operation_key = $1",
        [operationKey]
      );
      try {
        const result = await args.execute();
        const withMetadata: ProviderResult<T> = {
          ...result,
          metadata: { ...(result.metadata ?? {}), cacheHit: false, operationKey, operationAttempt: attempt },
        };
        const usage = usageFromResult(withMetadata);
        await client.query(
          `
          UPDATE provider_operations
          SET status = 'completed',
              result_json = $2::jsonb,
              input_tokens = $3,
              output_tokens = $4,
              total_tokens = $5,
              cached_tokens = $6,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE operation_key = $1
          `,
          [operationKey, JSON.stringify(withMetadata), usage.inputTokens, usage.outputTokens, usage.totalTokens, usage.cachedTokens]
        );
        return withMetadata;
      } catch (err) {
        lastError = err;
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    await client.query(
      `
      UPDATE provider_operations
      SET status = 'failed',
          error_message = $2,
          result_json = $3::jsonb,
          updated_at = NOW()
      WHERE operation_key = $1
      `,
      [
        operationKey,
        message,
        JSON.stringify({
          error: message,
          raw:
            lastError && typeof lastError === "object" && "raw" in lastError
              ? (lastError as { raw?: unknown }).raw
              : null,
        }),
      ]
    );
    throw lastError;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [baseOperationKey]);
    client.release();
  }
}

async function runWithAttempts<T>(execute: () => Promise<ProviderResult<T>>, maxAttempts: number): Promise<ProviderResult<T>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await execute();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
