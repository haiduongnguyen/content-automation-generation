import type { AppConfig } from "../../../config/env";
import { assertOpenAiQuotaAvailable } from "../../openAiQuota";
import { fetchWithTimeout, isRetryableHttpStatus, ProviderError, withLatencyMetadata } from "../errors";
import type { ProviderResult, TextProvider, TextProviderRequest } from "../types";

export type ResponsesPayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

export function extractOutputText(payload: ResponsesPayload): string {
  if (payload.output_text && payload.output_text.trim() !== "") {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim() !== "") {
        parts.push(content.text.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

export function createOpenAiTextProvider(cfg: AppConfig): TextProvider {
  return {
    name: "openai",
    model: cfg.openAiModel,
    async generate(request: TextProviderRequest): Promise<ProviderResult<string>> {
      await assertOpenAiQuotaAvailable(request.topicName);
      const startedAt = Date.now();
      try {
        const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.openAiApiKey}`,
          },
          body: JSON.stringify({
            model: cfg.openAiModel,
            input: [
              { role: "system", content: [{ type: "input_text", text: request.systemPrompt }] },
              { role: "user", content: [{ type: "input_text", text: request.userPrompt }] },
            ],
            text: { format: { type: "text" } },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new ProviderError({
            provider: "openai",
            model: cfg.openAiModel,
            code: "http_error",
            message: `OpenAI request failed: HTTP ${response.status} ${errText}`,
            retryable: isRetryableHttpStatus(response.status),
            statusCode: response.status,
            latencyMs: Date.now() - startedAt,
            raw: errText,
          });
        }

        const payload = (await response.json()) as ResponsesPayload;
        const outputText = extractOutputText(payload);
        if (outputText === "") {
          throw new ProviderError({
            provider: "openai",
            model: cfg.openAiModel,
            code: "missing_output",
            message: "OpenAI response missing output text.",
            retryable: false,
            latencyMs: Date.now() - startedAt,
            raw: payload,
          });
        }

        return withLatencyMetadata(
          {
            provider: "openai",
            model: cfg.openAiModel,
            output: outputText,
            raw: payload,
          },
          startedAt
        );
      } catch (err) {
        if (err instanceof ProviderError) {
          throw err;
        }
        throw new ProviderError({
          provider: "openai",
          model: cfg.openAiModel,
          code: "network_error",
          message: err instanceof Error ? err.message : "OpenAI network error.",
          retryable: true,
          latencyMs: Date.now() - startedAt,
          cause: err,
        });
      }
    },
  };
}
