// Curated fixture manifest (test-suite-spec.md). Each fixture declares why it exists
// and freezes a reviewed semantic summary — not the model JSON, not the SVG bytes.
// When an intentional generator change alters a summary, review the new sheet and
// update the summary in the same commit.
import type { GenerateOptions } from "../../src/engine";
import type { SemanticSummary } from "../helpers/model";

export interface Fixture {
  name: string;
  seed: string;
  options?: GenerateOptions;
  why: string;
  summary: SemanticSummary;
}

export const roles = ["basic-ga", "business-ga", "regional", "mid-hub", "major-hub", "mega-hub"] as const;

export const fixtures: Fixture[] = [
  // --- one per role ---
  {
    name: "role-basic-ga",
    seed: "fixture-basic-ga",
    options: { role: "basic-ga" },
    why: "smallest role; crosswind runway pair; no terminal",
    summary: { role: "basic-ga", archetype: "none", openRunways: 2, closedRunways: 0, headingFamilies: 2 },
  },
  {
    name: "role-business-ga",
    seed: "fixture-business-ga",
    options: { role: "business-ga" },
    why: "single-runway reliever with cargo/FBO but no terminal",
    summary: { role: "business-ga", archetype: "none", openRunways: 1, closedRunways: 0, headingFamilies: 1 },
  },
  {
    name: "role-regional",
    seed: "fixture-regional",
    options: { role: "regional" },
    why: "regional commercial with a pier terminal",
    summary: { role: "regional", archetype: "pier", openRunways: 2, closedRunways: 0, headingFamilies: 1 },
  },
  {
    name: "role-mid-hub",
    seed: "fixture-mid-hub",
    options: { role: "mid-hub" },
    why: "mid-hub with unit terminals, hold pads, overflow apron",
    summary: { role: "mid-hub", archetype: "unit", openRunways: 2, closedRunways: 0, headingFamilies: 1 },
  },
  {
    name: "role-major-hub",
    seed: "fixture-major-hub",
    options: { role: "major-hub" },
    why: "major hub with mixed runway heading families",
    summary: { role: "major-hub", archetype: "unit", openRunways: 3, closedRunways: 0, headingFamilies: 2 },
  },
  {
    name: "role-mega-hub",
    seed: "fixture-mega-hub",
    options: { role: "mega-hub" },
    why: "largest role; four runways in two heading families; dense sheet",
    summary: { role: "mega-hub", archetype: "satellite", openRunways: 4, closedRunways: 0, headingFamilies: 2 },
  },

  // --- one per archetype (forced via options) ---
  {
    name: "arch-linear",
    seed: "fixture-arch-linear",
    options: { role: "regional", archetype: "linear" },
    why: "linear terminal; also carries a closed legacy runway",
    summary: { role: "regional", archetype: "linear", openRunways: 2, closedRunways: 1, headingFamilies: 1 },
  },
  {
    name: "arch-pier",
    seed: "fixture-arch-pier",
    options: { role: "major-hub", archetype: "pier" },
    why: "pier ensemble at hub scale",
    summary: { role: "major-hub", archetype: "pier", openRunways: 3, closedRunways: 0, headingFamilies: 1 },
  },
  {
    name: "arch-parallel",
    seed: "fixture-arch-parallel",
    options: { role: "major-hub", archetype: "parallel" },
    why: "parallel midfield concourse ranks; RON ramps between bars",
    summary: { role: "major-hub", archetype: "parallel", openRunways: 3, closedRunways: 0, headingFamilies: 1 },
  },
  {
    name: "arch-satellite",
    seed: "fixture-arch-satellite",
    options: { role: "major-hub", archetype: "satellite" },
    why: "detached satellite pods with connectors",
    summary: { role: "major-hub", archetype: "satellite", openRunways: 3, closedRunways: 0, headingFamilies: 2 },
  },
  {
    name: "arch-unit",
    seed: "fixture-arch-unit",
    options: { role: "major-hub", archetype: "unit" },
    why: "independent unit terminals (JFK pattern)",
    summary: { role: "major-hub", archetype: "unit", openRunways: 3, closedRunways: 0, headingFamilies: 2 },
  },
  {
    name: "arch-semicircle",
    seed: "fixture-arch-semicircle",
    options: { role: "major-hub", archetype: "semicircle" },
    why: "curvilinear terminals (DFW pattern)",
    summary: { role: "major-hub", archetype: "semicircle", openRunways: 3, closedRunways: 0, headingFamilies: 2 },
  },

  // --- special states ---
  {
    name: "closed-legacy-runway",
    seed: "scan-40",
    why: "field with a closed former runway; exercises closed portrayal + caution line",
    summary: { role: "business-ga", archetype: "none", openRunways: 1, closedRunways: 1, headingFamilies: 1 },
  },
  {
    name: "east-west-field",
    seed: "scan-0",
    why: "predominantly east-west wind; exercises the rotated landscape sheet",
    summary: { role: "basic-ga", archetype: "none", openRunways: 1, closedRunways: 0, headingFamilies: 1 },
  },
  {
    name: "mixed-family-hub",
    seed: "scan-0",
    options: { role: "major-hub" },
    why: "two runway heading families at hub scale (crossing geometry, hotspots)",
    summary: { role: "major-hub", archetype: "parallel", openRunways: 3, closedRunways: 0, headingFamilies: 2 },
  },
  {
    name: "compact-sheet",
    seed: "LOCALIZER-SIGNAL-76",
    why: "historically pathological compact field; guards the whitespace-packing floor",
    summary: { role: "basic-ga", archetype: "none", openRunways: 2, closedRunways: 0, headingFamilies: 2 },
  },
];
