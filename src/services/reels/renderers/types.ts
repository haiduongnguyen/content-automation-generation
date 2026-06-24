import type { ReelRenderInput, ReelRenderMethod, ReelRenderResult } from "../types";

export interface ReelRenderer {
  readonly name: ReelRenderMethod;
  render(input: ReelRenderInput): Promise<ReelRenderResult>;
}
