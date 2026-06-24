import type { AppConfig } from "../../config/env";
import type { GeneratedImage, PostImageRole } from "../postImageGenerator";
import type { ProviderOperationType } from "../providerOperations";

export type ProviderResult<T> = {
  provider: string;
  model: string;
  output: T;
  raw?: unknown;
  metadata?: Record<string, unknown>;
};

export type TextProviderRequest = {
  topicName: string;
  systemPrompt: string;
  userPrompt: string;
  responseFormat: "json";
  operationKey?: string | undefined;
  operationType?: ProviderOperationType | undefined;
  validateOutput?: ((output: string) => boolean) | undefined;
};

export type TextProvider = {
  name: string;
  model: string;
  generate(request: TextProviderRequest): Promise<ProviderResult<string>>;
};

export type ImageProviderRequest = {
  topicName: string;
  postContent: string;
  prompt: string;
  seedDate: string;
  role: PostImageRole;
  operationKey?: string | undefined;
  operationType?: ProviderOperationType | undefined;
};

export type ImageProvider = {
  name: string;
  model: string;
  generate(request: ImageProviderRequest): Promise<ProviderResult<GeneratedImage[]>>;
};

export type ProviderFactoryArgs = {
  config: AppConfig;
};
