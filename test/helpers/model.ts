// Semantic summaries over SiteModel — the shape frozen by the fixture manifest.
import type { SiteModel } from "../../src/engine";

export interface SemanticSummary {
  role: SiteModel["role"];
  archetype: SiteModel["terminalArchetype"];
  openRunways: number;
  closedRunways: number;
  headingFamilies: number;
}

export function semanticSummary(model: SiteModel): SemanticSummary {
  const open = model.runways.filter((r) => !r.closed);
  return {
    role: model.role,
    archetype: model.terminalArchetype,
    openRunways: open.length,
    closedRunways: model.runways.length - open.length,
    headingFamilies: new Set(open.map((r) => Math.round(r.heading))).size,
  };
}
