import type { AppConfig } from "../../../config/env";
import { hashProviderRequest, runCachedProviderOperation } from "../../providerOperations";
import { fetchWithTimeout, isRetryableHttpStatus, ProviderError, withLatencyMetadata } from "../errors";
import type { ProviderResult, TextProvider, TextProviderRequest } from "../types";

export type GeminiPayload = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
};

export function extractGeminiText(payload: GeminiPayload): string {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (typeof part.text === "string" && part.text.trim() !== "") {
      return part.text.trim();
    }
  }
  return "";
}

export function createGeminiTextProvider(cfg: AppConfig, model: string = cfg.geminiModel): TextProvider {
  return {
    name: "gemini",
    model,
    async generate(request: TextProviderRequest): Promise<ProviderResult<string>> {
      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: `${request.systemPrompt}\n\n${request.userPrompt}` }],
          },
        ],
        generationConfig: {
          responseMimeType: request.responseFormat === "json" ? "application/json" : "text/plain",
        },
      };
      const requestHash = hashProviderRequest(requestBody);
      return runCachedProviderOperation({
        operationKey: request.operationKey ? `${request.operationKey}:${model}:${requestHash}` : undefined,
        operationType: request.operationType,
        provider: "gemini",
        model,
        requestHash,
        maxAttempts: cfg.geminiOperationMaxAttempts || 2,
        execute: async () => {
          const startedAt = Date.now();
          try {
        const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": cfg.geminiApiKey,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new ProviderError({
            provider: "gemini",
            model,
            code: "http_error",
            message: `Gemini request failed: HTTP ${response.status} ${errText}`,
            retryable: isRetryableHttpStatus(response.status),
            statusCode: response.status,
            latencyMs: Date.now() - startedAt,
            raw: errText,
          });
        }

        const payload = (await response.json()) as GeminiPayload;
        const outputText = extractGeminiText(payload);
        if (outputText === "") {
          throw new ProviderError({
            provider: "gemini",
            model,
            code: "missing_output",
            message: "Gemini response missing output text.",
            retryable: false,
            latencyMs: Date.now() - startedAt,
            raw: payload,
          });
        }
        if (request.validateOutput && !request.validateOutput(outputText)) {
          throw new ProviderError({
            provider: "gemini",
            model,
            code: "invalid_output",
            message: "Gemini response did not pass output validation.",
            retryable: true,
            latencyMs: Date.now() - startedAt,
            raw: payload,
          });
        }

        return withLatencyMetadata(
          {
            provider: "gemini",
            model,
            output: outputText,
            raw: payload,
            metadata: {
              usage: {
                inputTokens: payload.usageMetadata?.promptTokenCount ?? null,
                outputTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
                totalTokens: payload.usageMetadata?.totalTokenCount ?? null,
                cachedTokens: payload.usageMetadata?.cachedContentTokenCount ?? null,
              },
            },
          },
          startedAt
        );
          } catch (err) {
        if (err instanceof ProviderError) {
          throw err;
        }
        throw new ProviderError({
          provider: "gemini",
          model,
          code: "network_error",
          message: err instanceof Error ? err.message : "Gemini network error.",
          retryable: true,
          latencyMs: Date.now() - startedAt,
          cause: err,
        });
          }
        },
      });
    },
  };
}
