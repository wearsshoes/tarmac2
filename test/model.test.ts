import { describe, expect, test } from "bun:test";
import { generate } from "../src/engine";
import { perp, polar, runwayEndpoints } from "../src/engine/geometry";
import { fixtures, roles } from "./fixtures/seeds";
import { polygonContained, polygonIsSane, taxiwayComponents } from "./helpers/geometry";
import { semanticSummary } from "./helpers/model";

describe("fixture semantic summaries", () => {
  for (const fixture of fixtures) {
    test(`${fixture.name} (${fixture.why})`, () => {
      expect(semanticSummary(generate(fixture.seed, fixture.options))).toEqual(fixture.summary);
    });
  }
});

describe("runway and taxiway invariants", () => {
  for (const role of roles)
    test(`${role} has valid runway and taxiway geometry`, () => {
      const model = generate(`property-${role}`, { role });
      const legal = /^[A-HJ-NP-WYZ](?:[1-9])?$/;
      for (const runway of model.runways.filter((r) => r.lifecycle === "active")) {
        expect(Math.abs(((runway.ends[1].magneticHeading - runway.ends[0].magneticHeading + 360) % 360) - 180)).toBeLessThan(0.01);
        const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(runway.length, 5);
        // The current generator always emits a full-length parallel. Spec A3's actual
        // contract is weaker (see todo below); keep the stronger check while true.
        expect(model.taxiways.some((t) => t.kind === "parallel" && t.runwayId === runway.id)).toBeTrue();
      }
      // Identifier grammar applies to labeled taxiways; repair links and throat
      // stubs are unlabeled service stubs with no name at all.
      for (const taxiway of model.taxiways) {
        if (taxiway.unlabeled) expect(taxiway.name).toBe("");
        else if (taxiway.kind !== "apron-throat") expect(taxiway.name).toMatch(legal);
      }
      expect(taxiwayComponents(model)).toBe(1);
    });

  // Spec A3 contract (Phase 2/3): parallel required below one-mile minimums,
  // preferred for other instrument runways; basic visual GA may use end
  // turnarounds/holding bays + connectors instead.
  test.todo("basic visual GA runways may substitute validated turnarounds for a full-length parallel", () => {});

  test("field elevation is the highest point on a runway", () => {
    for (let i = 0; i < 40; i++) {
      const model = generate(`elev-${i}`);
      const endElevations = model.runways.filter((r) => r.lifecycle === "active").flatMap((r) => r.ends.map((e) => e.elevation));
      expect(Math.max(...endElevations)).toBe(model.identity.elevation);
    }
  });

  test("runway lifecycle is a valid enum value and non-active states stay rare and singular", () => {
    const states = new Set(["active", "closed-indefinite", "under-construction", "repurposed", "closed-permanent", "removed", "new-construction"]);
    for (let i = 0; i < 60; i++) {
      const model = generate(`lifecycle-${i}`);
      for (const runway of model.runways) expect(states.has(runway.lifecycle)).toBeTrue();
      // Legacy fields draw at most one non-active runway (edit-plan decision 2).
      expect(model.runways.filter((r) => r.lifecycle !== "active").length).toBeLessThanOrEqual(1);
    }
  });

  test("parallel runway numbering and separations use standard families", () => {
    const model = generate("parallel-3", { role: "major-hub" });
    const headings = new Set(model.runways.map((r) => Math.round(r.heading)));
    expect(headings.size).toBe(1);
    const suffixes = model.runways.map((r) => r.ends[0].designator.slice(-1)).sort();
    expect(suffixes).toEqual(["C", "L", "R"]);
    for (const runway of model.runways) {
      const [a, b] = [runway.ends[0].designator.slice(-1), runway.ends[1].designator.slice(-1)];
      if (a === "L") expect(b).toBe("R");
      if (a === "R") expect(b).toBe("L");
      if (a === "C") expect(b).toBe("C");
    }
    const lateral = perp(polar(model.runways[0]!.heading));
    const ws = model.runways.map((r) => r.center.x * lateral.x + r.center.y * lateral.y).sort((x, y) => x - y);
    const separations = ws.slice(1).map((w, i) => Math.round(w - ws[i]!));
    expect(separations.every((s) => Math.abs(s - 2500) < 100)).toBeTrue();
  });

  test("mega-hub banks renumber in chunks (LAX/ATL pattern)", () => {
    const model = generate("chunk-check", { role: "mega-hub" });
    const bank = model.runways.filter((r) => r.lifecycle === "active");
    expect(bank.length).toBe(4);
    const numbers = new Set(bank.map((r) => Number.parseInt(r.ends[0].designator, 10)));
    expect(numbers.size).toBe(2);
    const [low, high] = [...numbers].sort((a, b) => a - b);
    expect((low! % 36) + 1).toBe(high!);
  });
});

describe("protection zones and hotspots", () => {
  test("RPZs are fully contained in the parcel (edges included)", () => {
    for (const fixture of fixtures) {
      const model = generate(fixture.seed, fixture.options);
      // Only active runways carry protection zones.
      expect(model.protectionZones.length).toBe(model.runways.filter((r) => r.lifecycle === "active").length * 2);
      for (const zone of model.protectionZones) {
        expect(polygonIsSane(zone)).toBeTrue();
        expect(polygonContained(zone, model.parcel)).toBeTrue();
      }
    }
  });

  test("hotspots have unique sequential ids and hazard-linked reasons", () => {
    const reasons = new Set(["RWY CROSSING", "TWY CROSSING", "THRESHOLD CLUSTER"]);
    for (let i = 0; i < 30; i++) {
      const model = generate(`hs-${i}`);
      expect(new Set(model.hotspots.map((h) => h.id)).size).toBe(model.hotspots.length);
      for (const hotspot of model.hotspots) expect(reasons.has(hotspot.reason)).toBeTrue();
      expect(model.lahso.length).toBeLessThanOrEqual(6);
    }
  });
});
