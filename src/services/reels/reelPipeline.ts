import type { ReelRenderer } from "./renderers/types";
import type { MediaStorage } from "./storage/types";
import type { ReelRenderInput, ReelRenderResult } from "./types";

export type ReelPipelineDependencies = {
  renderer: ReelRenderer;
  storage: MediaStorage;
};

export async function renderReel(
  input: ReelRenderInput,
  dependencies: ReelPipelineDependencies
): Promise<ReelRenderResult> {
  return dependencies.renderer.render(input);
}
