import type { ProviderResult } from "./types";

export type ProviderErrorArgs = {
  provider: string;
  model?: string;
  code: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
  latencyMs?: number;
  cause?: unknown;
  raw?: unknown;
};

export class ProviderError extends Error {
  provider: string;
  model: string | undefined;
  code: string;
  retryable: boolean;
  statusCode: number | undefined;
  latencyMs: number | undefined;
  causeMessage: string | undefined;
  raw?: unknown;

  constructor(args: ProviderErrorArgs) {
    super(args.message);
    this.name = "ProviderError";
    this.provider = args.provider;
    this.model = args.model;
    this.code = args.code;
    this.retryable = args.retryable;
    this.statusCode = args.statusCode;
    this.latencyMs = args.latencyMs;
    this.causeMessage = args.cause instanceof Error ? args.cause.message : undefined;
    this.raw = args.raw;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

export function isRetryableHttpStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 409 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

export function providerErrorToMetadata(error: unknown): Record<string, unknown> {
  if (!isProviderError(error)) {
    return {
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    provider: error.provider,
    model: error.model,
    code: error.code,
    retryable: error.retryable,
    statusCode: error.statusCode,
    latencyMs: error.latencyMs,
    message: error.message,
  };
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = getProviderTimeoutMs()): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function getProviderTimeoutMs(): number {
  const raw = process.env.PROVIDER_TIMEOUT_MS?.trim() || "60000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60000;
  }
  return parsed;
}

export function withLatencyMetadata<T>(result: ProviderResult<T>, startedAt: number): ProviderResult<T> {
  return {
    ...result,
    metadata: {
      ...(result.metadata ?? {}),
      latencyMs: Date.now() - startedAt,
    },
  };
}
