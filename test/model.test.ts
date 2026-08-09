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
        // Spec A3: instrument runways require a full-length parallel; basic visual
        // GA may substitute validated turnarounds (checked in its own test below).
        const hasParallel = model.taxiways.some((t) => t.kind === "parallel" && t.runwayId === runway.id);
        if (role !== "basic-ga") expect(hasParallel).toBeTrue();
        else if (!hasParallel) {
          expect(model.taxiways.some((t) => t.kind === "connector" && t.runwayId === runway.id)).toBeTrue();
        }
      }
      // Identifier grammar applies to labeled taxiways; repair links and throat
      // stubs are unlabeled service stubs with no name at all.
      for (const taxiway of model.taxiways) {
        if (taxiway.unlabeled) expect(taxiway.name).toBe("");
        else if (taxiway.kind !== "apron-throat") expect(taxiway.name).toMatch(legal);
      }
      expect(taxiwayComponents(model)).toBe(1);
    });

  // Spec A3: parallel required below one-mile minimums, preferred for other
  // instrument runways; basic visual GA may substitute turnarounds + connectors.
  test("basic visual GA runways may substitute validated turnarounds for a full-length parallel", () => {
    let substituted = 0;
    for (let i = 0; i < 50; i++) {
      const model = generate(`turnaround-${i}`, { role: "basic-ga" });
      for (const runway of model.runways.filter((r) => r.lifecycle === "active")) {
        if (model.taxiways.some((t) => t.kind === "parallel" && t.runwayId === runway.id)) continue;
        substituted++;
        // Validated: unlabeled turnaround pavement near both ends + connectors.
        const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
        for (const end of [a, b]) {
          const pad = model.aprons.find((apron) => apron.kind === "hold-pad" && !apron.label &&
            apron.polygon.some((p) => Math.hypot(p.x - end.x, p.y - end.y) < 700));
          expect(pad).toBeDefined();
        }
        expect(model.taxiways.filter((t) => t.kind === "connector" && t.runwayId === runway.id).length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(substituted).toBeGreaterThan(0);
  });

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
    const families = [700, 1000, 1200, 2000, 2500, 3400, 4300];
    const model = generate("parallel-3", { role: "major-hub" });
    const open = model.runways.filter((r) => r.lifecycle === "active");
    const headings = new Set(open.map((r) => Math.round(r.heading)));
    expect(headings.size).toBe(1);
    const suffixes = open.map((r) => r.ends[0].designator.slice(-1)).sort();
    expect(suffixes).toEqual(["C", "L", "R"]);
    for (const runway of open) {
      const [a, b] = [runway.ends[0].designator.slice(-1), runway.ends[1].designator.slice(-1)];
      if (a === "L") expect(b).toBe("R");
      if (a === "R") expect(b).toBe("L");
      if (a === "C") expect(b).toBe("C");
    }
    // Separations come from the standard families, across many seeds.
    for (let i = 0; i < 25; i++) {
      const m = generate(`separation-${i}`, { role: "major-hub" });
      const bank = m.runways.filter((r) => r.lifecycle === "active" && Math.round(r.heading) === Math.round(m.windHeading));
      const lateral = perp(polar(m.windHeading));
      const ws = bank.map((r) => r.center.x * lateral.x + r.center.y * lateral.y).sort((x, y) => x - y);
      const separations = ws.slice(1).map((w, k) => Math.round(w - ws[k]!));
      for (const s of separations) expect(families.some((f) => Math.abs(s - f) < 100)).toBeTrue();
    }
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
