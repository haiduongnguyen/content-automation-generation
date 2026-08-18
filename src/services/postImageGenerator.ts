import { loadConfig } from "../config/env";
import { resolveImageProvider } from "./providers/registry";

export type PostImageRole = "practical_example" | "formula_ai_application";

export type GeneratedImage = {
  role: PostImageRole;
  prompt: string;
  mimeType: string;
  b64Data: string;
};

export type ImageFailureMode = "fail_job" | "continue_text_only";

export function shouldContinueAfterImageFailure(mode: ImageFailureMode): boolean {
  return mode === "continue_text_only";
}

function hashDateSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function pickDailyImageRole(seedDate: string): PostImageRole {
  const roles: PostImageRole[] = ["practical_example", "formula_ai_application"];
  const idx = hashDateSeed(seedDate) % roles.length;
  return roles[idx] ?? "practical_example";
}

export function buildImagePrompt(params: {
  role: PostImageRole;
  topicName: string;
  postContent: string;
  outputSize?: string;
}): string {
  const concept = [params.topicName, params.postContent]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
  const base = [
    "Create a standalone square educational illustration about AI and mathematics.",
    "This is NOT a poster, NOT a social media screenshot, NOT a phone UI, NOT a classroom scene, NOT a document, NOT a dashboard, NOT a labeled infographic.",
    `Internal concept only, do not render these words: ${concept}`,
    "Use the concept only to choose objects, metaphor, composition, colors, and relationships.",
    "Strict no-text rule: no words, no letters, no numbers, no formulas, no captions, no labels, no UI text, no hashtags, no logos, no watermarks.",
    "Avoid all text-prone surfaces: no phone, no laptop screen, no tablet, no paper, no document card, no poster, no whiteboard, no blackboard, no sign, no chart axes.",
    "If the concept involves formulas, data, or labels, represent them only with abstract 3D shapes, colored dots, unlabeled nodes, arrows, gradients, heatmap blobs, decision regions, and icon-like symbols without glyphs.",
    "Style: clean modern abstract editorial illustration, light warm background, high contrast, polished, uncluttered, suitable as a visual companion to an educational caption.",
  ];

  if (params.role === "practical_example") {
    return [
      ...base,
      "Visual direction: show a concrete real-world scene or object system that explains the concept through action.",
      "Prefer objects, workflows, sensors, data points, decision paths, and abstract environments. Avoid classrooms, screens, cards, papers, charts, and generic robot mascots.",
      "Show how mathematics helps the AI make a useful decision, entirely without text.",
      "Square composition, sharp, professional.",
    ].join("\n");
  }

  return [
    ...base,
    "Visual direction: abstract technical diagram without text.",
    "Use unlabeled nodes, arrows, model blocks, decision boundaries, heatmaps, vector fields, uncertainty halos, and geometric objects.",
    "Show a flow from mathematical idea to computation to AI outcome using visuals only.",
    "No people, no classroom, no phone interface, no textual elements.",
    "Square composition, sharp, professional.",
  ].join("\n");
}

export async function generatePostImages(params: {
  topicName: string;
  postContent: string;
  seedDate: string;
  operationKey?: string;
}): Promise<GeneratedImage[]> {
  const cfg = loadConfig();
  if (!cfg.imageGenerationEnabled) {
    return [];
  }

  const roles: PostImageRole[] = [pickDailyImageRole(params.seedDate)];
  const images: GeneratedImage[] = [];
  const provider = resolveImageProvider({ config: cfg });

  for (const role of roles) {
    const prompt = buildImagePrompt({ role, topicName: params.topicName, postContent: params.postContent, outputSize: cfg.imageOutputSize });
    const result = await provider.generate({
      topicName: params.topicName,
      postContent: params.postContent,
      prompt,
      seedDate: params.seedDate,
      role,
      operationKey: params.operationKey,
      operationType: params.operationKey ? "post_image" : undefined,
    });
    images.push(...result.output);
  }

  return images;
}
