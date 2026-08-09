// Population sweeps: the fast tier runs on every invocation. Set TARMAC_FULL_POP=1
// for the larger corpus (slower; use before declaring a pass complete).
import { describe, expect, test } from "bun:test";
import { generate, render } from "../src/engine";
import { roles } from "./fixtures/seeds";
import { clearsRunway, pointInPolygon } from "./helpers/geometry";

const FULL = Boolean(process.env["TARMAC_FULL_POP"]);
const SWEEP = FULL ? 1000 : 200;
const PER_ROLE = FULL ? 250 : 80;
const RENDERS_PER_ROLE = FULL ? 60 : 24;

describe("population", () => {
  test(`${SWEEP}-seed population remains finite, unique, and renderable`, () => {
    for (let i = 0; i < SWEEP; i++) {
      const model = generate(`population-${i}`);
      expect(new Set(model.runways.map((runway) => runway.id)).size).toBe(model.runways.length);
      expect(model.protectionZones.length).toBe(model.runways.filter((runway) => runway.lifecycle === "active").length * 2);
      for (const zone of model.protectionZones) {
        for (const point of zone) expect(pointInPolygon(point, model.parcel)).toBeTrue();
        for (const building of model.buildings) {
          const center = building.polygon.reduce(
            (sum, point) => ({ x: sum.x + point.x / building.polygon.length, y: sum.y + point.y / building.polygon.length }),
            { x: 0, y: 0 },
          );
          if (pointInPolygon(center, zone)) throw new Error(`${model.seed}: ${building.id} intrudes into an RPZ`);
          for (const point of building.polygon) if (pointInPolygon(point, zone)) throw new Error(`${model.seed}: ${building.id} crosses an RPZ boundary`);
        }
      }
      const svg = render(model);
      expect(svg).not.toContain("NaN");
      expect(svg.startsWith("<?xml")).toBeTrue();
    }
  });

  test("large airports vary between parallel banks and mixed runway families", () => {
    const mixedCounts = new Map<string, number>();
    for (const role of ["mid-hub", "major-hub", "mega-hub"] as const) {
      let mixed = 0;
      for (let i = 0; i < 80; i++) {
        const model = generate(`topology-${i}`, { role });
        const headings = [...new Set(model.runways.filter((runway) => runway.lifecycle === "active").map((runway) => Math.round(runway.heading)))];
        if (headings.length > 1) {
          mixed++;
          const separation = Math.abs(headings[0]! - headings[1]!);
          const acute = Math.min(separation, 360 - separation);
          expect(acute).toBeGreaterThanOrEqual(40);
          expect(acute).toBeLessThanOrEqual(84);
        }
      }
      mixedCounts.set(role, mixed);
      expect(mixed).toBeLessThan(75); // all-parallel ATL/DEN-style fields still exist
    }
    expect(mixedCounts.get("mid-hub")!).toBeGreaterThan(20);
    expect(mixedCounts.get("major-hub")!).toBeGreaterThan(30);
    expect(mixedCounts.get("mega-hub")!).toBeGreaterThan(40);
  });

  test("runway corridors stay clear of aprons and buildings", () => {
    for (const role of roles)
      for (let i = 0; i < PER_ROLE; i++) {
        const model = generate(`district-clearance-${i}`, { role });
        for (const runway of model.runways.filter((candidate) => candidate.lifecycle === "active")) {
          for (const apron of model.aprons) expect(clearsRunway(apron.polygon, runway)).toBeTrue();
          for (const building of model.buildings) expect(clearsRunway(building.polygon, runway)).toBeTrue();
        }
      }
  });

  test("dense charts do not force text labels on top of other text", () => {
    for (const role of roles)
      for (let i = 0; i < RENDERS_PER_ROLE; i++) {
        const out = render(generate(`overlap-${i}`, { role }));
        expect(out).toContain(`data-label-priority="runway,taxiway,facility,hotspot"`);
        expect(out).toContain(`data-label-overlaps="0"`);
        expect(out).toContain(`data-label-overlap-items=""`);
      }
  });

  test("repair taxiways avoid RPZs and are unlabeled", () => {
    for (let i = 0; i < SWEEP; i++) {
      const model = generate(`population-${i}`);
      for (const taxiway of model.taxiways.filter((t) => t.id.startsWith("repair-"))) {
        expect(taxiway.unlabeled).toBeTrue();
        expect(taxiway.name).toBe("");
        for (let k = 0; k < taxiway.points.length - 1; k++) {
          const a = taxiway.points[k]!;
          const b = taxiway.points[k + 1]!;
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          for (const zone of model.protectionZones) {
            expect(pointInPolygon(mid, zone)).toBeFalse();
            expect(pointInPolygon(a, zone)).toBeFalse();
          }
        }
      }
    }
  });

  // Phase 5 calibration: semantic diversity metrics, not vertex counts.
  test("terminal family and unit-count distributions stay diverse at hub scale", () => {
    for (const role of ["major-hub", "mega-hub"] as const) {
      const familyCounts = new Map<string, number>();
      const unitCounts = new Set<number>();
      const total = 70;
      for (let i = 0; i < total; i++) {
        const model = generate(`calibration-${i}`, { role });
        familyCounts.set(model.terminalArchetype, (familyCounts.get(model.terminalArchetype) ?? 0) + 1);
        if (model.terminal) unitCounts.add(model.terminal.units.length);
      }
      // Several families appear and none dominates the population.
      expect(familyCounts.size).toBeGreaterThanOrEqual(3);
      for (const count of familyCounts.values()) expect(count).toBeLessThan(total * 0.75);
      // Unit counts vary (single-processor systems up to multi-unit rows).
      expect(unitCounts.size).toBeGreaterThanOrEqual(3);
    }
  });

  test("district composition varies across seeds within each role", () => {
    for (const role of ["business-ga", "regional", "mid-hub"] as const) {
      const sets = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const model = generate(`district-set-${i}`, { role });
        const kinds = new Set<string>([
          ...model.aprons.map((apron) => apron.kind),
          ...model.buildings.map((building) => building.kind),
        ]);
        sets.add([...kinds].sort().join(","));
      }
      expect(sets.size).toBeGreaterThanOrEqual(4);
    }
  });
});
