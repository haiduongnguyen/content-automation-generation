import type { AppConfig } from "../../../config/env";
import { fetchWithTimeout, isRetryableHttpStatus, ProviderError, withLatencyMetadata } from "../errors";
import type { ProviderResult, TextProvider, TextProviderRequest } from "../types";

type ChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export function createOpenAiCompatibleTextProvider(cfg: AppConfig, args?: { baseUrl?: string; model?: string; name?: string }): TextProvider {
  const baseUrl = (args?.baseUrl || cfg.textOpenAiCompatibleBaseUrl || cfg.ollamaBaseUrl).replace(/\/$/, "");
  const model = args?.model || cfg.textOpenAiCompatibleModel || cfg.ollamaModel;
  const name = args?.name || "openai_compatible";

  return {
    name,
    model,
    async generate(request: TextProviderRequest): Promise<ProviderResult<string>> {
      if (!baseUrl) {
        throw new ProviderError({ provider: name, model, code: "invalid_config", message: `${name}: base URL is not configured.`, retryable: false });
      }
      if (!model) {
        throw new ProviderError({ provider: name, model, code: "invalid_config", message: `${name}: model is not configured.`, retryable: false });
      }
      const startedAt = Date.now();
      try {
        const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.TEXT_OPENAI_COMPATIBLE_API_KEY || process.env.OPENAI_API_KEY || "ollama"}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: request.systemPrompt },
              { role: "user", content: request.userPrompt },
            ],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new ProviderError({
            provider: name,
            model,
            code: "http_error",
            message: `${name} request failed: HTTP ${response.status} ${errText}`,
            retryable: isRetryableHttpStatus(response.status),
            statusCode: response.status,
            latencyMs: Date.now() - startedAt,
            raw: errText,
          });
        }

        const payload = (await response.json()) as ChatCompletionPayload;
        const output = payload.choices?.[0]?.message?.content?.trim() || "";
        if (!output) {
          throw new ProviderError({
            provider: name,
            model,
            code: "missing_output",
            message: `${name} response missing output text.`,
            retryable: false,
            latencyMs: Date.now() - startedAt,
            raw: payload,
          });
        }

        return withLatencyMetadata({ provider: name, model, output, raw: payload }, startedAt);
      } catch (err) {
        if (err instanceof ProviderError) {
          throw err;
        }
        throw new ProviderError({
          provider: name,
          model,
          code: "network_error",
          message: err instanceof Error ? err.message : `${name} network error.`,
          retryable: true,
          latencyMs: Date.now() - startedAt,
          cause: err,
        });
      }
    },
  };
}
