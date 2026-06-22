import type { AppConfig } from "../../../config/env";
import { hashProviderRequest, runCachedProviderOperation } from "../../providerOperations";
import { fetchWithTimeout, isRetryableHttpStatus, ProviderError, withLatencyMetadata } from "../errors";
import type { ImageProvider, ImageProviderRequest, ProviderResult } from "../types";
import type { GeneratedImage } from "../../postImageGenerator";

type GeminiImagePayload = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
        inline_data?: {
          mime_type?: string;
          data?: string;
        };
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
};

function extractGeminiImage(payload: GeminiImagePayload): { mimeType: string; b64Data: string } | null {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inlineData = part.inlineData ?? (part.inline_data ? { mimeType: part.inline_data.mime_type, data: part.inline_data.data } : undefined);
    if (inlineData?.data && inlineData.data.trim() !== "") {
      return {
        mimeType: inlineData.mimeType || "image/png",
        b64Data: inlineData.data,
      };
    }
  }
  return null;
}

export function createGeminiImageProvider(cfg: AppConfig, model = cfg.geminiImageModel): ImageProvider {
  return {
    name: "gemini",
    model,
    async generate(request: ImageProviderRequest): Promise<ProviderResult<GeneratedImage[]>> {
      const requestBody = {
        contents: [
          {
            parts: [{ text: request.prompt }],
          },
        ],
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
        const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
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
            message: `Gemini image request failed: HTTP ${response.status} ${errText}`,
            retryable: isRetryableHttpStatus(response.status),
            statusCode: response.status,
            latencyMs: Date.now() - startedAt,
            raw: errText,
          });
        }

        const payload = (await response.json()) as GeminiImagePayload;
        const image = extractGeminiImage(payload);
        if (!image) {
          throw new ProviderError({
            provider: "gemini",
            model,
            code: "missing_output",
            message: "Gemini image response missing inline image data.",
            retryable: false,
            latencyMs: Date.now() - startedAt,
            raw: payload,
          });
        }

        return withLatencyMetadata(
          {
            provider: "gemini",
            model,
            output: [
              {
                role: request.role,
                prompt: request.prompt,
                mimeType: image.mimeType,
                b64Data: image.b64Data,
              },
            ],
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
          message: err instanceof Error ? err.message : "Gemini image network error.",
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
