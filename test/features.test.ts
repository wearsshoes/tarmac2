// Phase 4: role-gated located features and furniture families (edit-plan).
// Each family is backed by typed model data, appears at plausible per-role
// frequency, and never all at once on one sheet (spec B6).
import { describe, expect, test } from "bun:test";
import { generate, render } from "../src/engine";
import type { SiteModel } from "../src/engine";
import { groupContent } from "./helpers/svg";

function familiesOf(model: SiteModel): string[] {
  return [
    model.lightingNotes.length > 0 && "lighting",
    model.declaredDistances && "declared",
    model.windCone !== null && "wind",
    model.helipads.length > 0 && "helipad",
    model.aprons.some((a) => a.kind === "deice") && "deice",
    model.nonMovementApronIds.length > 0 && "nonmove",
    model.hotspotTable && "hstable",
  ].filter(Boolean) as string[];
}

describe("located features and furniture families", () => {
  test("families sprinkle across the population and never all appear at once", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 150; i++) {
      const model = generate(`feature-${i}`);
      const families = familiesOf(model);
      expect(families.length).toBeLessThanOrEqual(4);
      for (const family of families) counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    for (const family of ["lighting", "declared", "wind", "helipad", "deice", "nonmove", "hstable"]) {
      expect(counts.get(family) ?? 0).toBeGreaterThan(5);
      expect(counts.get(family) ?? 0).toBeLessThan(140);
    }
  });

  test("features are typed facts with valid role gating", () => {
    for (let i = 0; i < 80; i++) {
      const model = generate(`feature-${i}`);
      const hub = model.role.includes("hub");
      // Deice pads are hub-only and labeled with leaders via the apron machinery.
      const deice = model.aprons.filter((apron) => apron.kind === "deice");
      if (deice.length > 0) {
        expect(hub).toBeTrue();
        for (const pad of deice) expect(pad.label).toBe("DEICE PAD");
      }
      // Declared distances never at basic GA.
      if (model.declaredDistances) expect(model.role).not.toBe("basic-ga");
      // Approach lights and VGSI only on active runway ends, with valid values.
      for (const runway of model.runways) {
        for (const end of runway.ends) {
          if (runway.lifecycle !== "active") {
            expect(end.approachLights).toBeUndefined();
            expect(end.vgsi).toBeUndefined();
          }
          if (end.vgsi) expect(["L", "R"]).toContain(end.vgsi.side);
          if (end.approachLights) expect(["MALSR", "ALSF-2", "SSALR", "ODALS"]).toContain(end.approachLights);
        }
      }
      // Non-movement flags reference real aprons.
      for (const id of model.nonMovementApronIds) {
        expect(model.aprons.some((apron) => apron.id === id)).toBeTrue();
      }
    }
  });

  test("ramp frequency table rows link to ramps that exist on the sheet", () => {
    const fixed = new Set(["TERMINAL RAMP", "Snow and Ice", "Non Movement Area"]);
    let linked = 0;
    for (let i = 0; i < 60; i++) {
      const model = generate(`ramp-link-${i}`);
      if (model.rampFrequencies.length === 0) continue;
      const labels = new Set(model.aprons.map((apron) => apron.label ?? ""));
      for (const [name] of model.rampFrequencies) {
        if (fixed.has(name!)) continue;
        expect(labels.has(name!)).toBeTrue();
        linked++;
      }
    }
    expect(linked).toBeGreaterThan(5);
  });

  test("each family renders its symbol or block", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 150 && seen.size < 7; i++) {
      const model = generate(`feature-${i}`);
      const need: [string, string][] = [];
      if (model.windCone && !seen.has("wind")) need.push(["wind", `id="wind-cone"`]);
      if (model.helipads.length > 0 && !seen.has("helipad")) need.push(["helipad", `id="helipad-0"`]);
      if (model.lightingNotes.length > 0 && !seen.has("lighting")) need.push(["lighting", `id="lighting-block"`]);
      if (model.hotspotTable && model.hotspots.length > 0 && !seen.has("hstable")) need.push(["hstable", `id="hotspot-table"`]);
      if (model.declaredDistances && !seen.has("declared")) need.push(["declared", `id="declared-distances"`]);
      if (model.nonMovementApronIds.length > 0 && !seen.has("nonmove")) need.push(["nonmove", `id="non-movement-`]);
      if (model.runways.some((r) => r.ends.some((end) => end.approachLights)) && !seen.has("als")) need.push(["als", ""]);
      if (need.length === 0) continue;
      const svg = render(model);
      for (const [key, marker] of need) {
        if (marker) expect(svg).toContain(marker);
        seen.add(key);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  test("hotspot table surfaces the modeled reasons", () => {
    for (let i = 0; i < 60; i++) {
      const model = generate(`feature-${i}`);
      if (!model.hotspotTable || model.hotspots.length === 0) continue;
      const table = groupContent(render(model), "hotspot-table");
      expect(table).toContain("HOT SPOTS");
      for (const hotspot of model.hotspots) {
        expect(table).toContain(`HS ${hotspot.id}`);
        expect(table).toContain(hotspot.reason);
      }
      return;
    }
    throw new Error("no hotspot-table sheet found in the sweep");
  });
});
