import { describe, expect, test } from "bun:test";
import { generate } from "../src/engine";
import { polylineDistance } from "../src/engine/geometry";
import { fixtures } from "./fixtures/seeds";
import { polygonIsSane, polygonsOverlap, touchesPolygon } from "./helpers/geometry";

// Phase 3 acceptance contract (terminal-generator-plan.md). The hierarchy, edge
// roles, circulation, and derived-apron assertions run on typed records, never
// on polygon or label counts.

const terminalFixtures = fixtures.filter((fixture) => fixture.summary.archetype !== "none");

describe("terminal and apron structure", () => {
  for (const fixture of fixtures) {
    test(`${fixture.name}: aprons are sane and served`, () => {
      const model = generate(fixture.seed, fixture.options);

      if (model.terminalArchetype !== "none") {
        expect(model.aprons.some((a) => a.kind === "terminal")).toBeTrue();
        expect(model.buildings.some((b) => b.kind === "terminal")).toBeTrue();
      }

      for (const apron of model.aprons) expect(polygonIsSane(apron.polygon)).toBeTrue();
      for (const building of model.buildings) expect(polygonIsSane(building.polygon)).toBeTrue();

      // Every apron-throat taxiway starts or ends at an apron.
      for (const throat of model.taxiways.filter((t) => t.kind === "apron-throat")) {
        const ends = [throat.points[0]!, throat.points[throat.points.length - 1]!];
        expect(ends.some((e) => model.aprons.some((a) => touchesPolygon(e, a.polygon, 60)))).toBeTrue();
      }
    });
  }
});

describe("terminal rebuild contract (Phase 3)", () => {
  test("terminal hierarchy is typed: every concourse/satellite has a terminal parent", () => {
    for (const fixture of terminalFixtures) {
      const model = generate(fixture.seed, fixture.options);
      const system = model.terminal;
      expect(system).not.toBeNull();
      expect(system!.units.length).toBeGreaterThan(0);
      expect(system!.gatesPlanned).toBeGreaterThan(0);
      const unitIds = new Set(system!.units.map((unit) => unit.id));
      for (const component of system!.components) {
        expect(unitIds.has(component.unitId)).toBeTrue();
        expect(component.edges.length).toBeGreaterThan(2);
      }
      // Every unit has exactly one processor, asserted from records.
      for (const unit of system!.units) {
        expect(system!.components.filter((c) => c.unitId === unit.id && c.kind === "processor").length).toBe(1);
      }
    }
  });

  test("gate faces carry apron bands; landside courts are never aircraft apron", () => {
    for (const fixture of terminalFixtures) {
      const model = generate(fixture.seed, fixture.options);
      const system = model.terminal!;
      const bands = model.aprons.filter((apron) => apron.kind === "terminal");
      for (const component of system.components) {
        for (const edge of component.edges.filter((e) => e.role === "gate-face")) {
          const mid = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
          expect(bands.some((band) => touchesPolygon(mid, band.polygon, 10))).toBeTrue();
          expect(edge.aircraftClass).toBeDefined();
        }
      }
      for (const unit of system.units) {
        for (const apron of model.aprons) {
          if (polygonsOverlap(unit.landsideCourt, apron.polygon)) {
            throw new Error(`${fixture.name}: ${apron.id} paves the landside court of ${unit.id}`);
          }
        }
      }
      for (const court of system.roadCourts) {
        for (const apron of model.aprons) {
          expect(polygonsOverlap(court, apron.polygon)).toBeFalse();
        }
      }
    }
  });

  test("every stand reaches a taxilane, collector, throat, and named taxiway", () => {
    for (const fixture of terminalFixtures) {
      const model = generate(fixture.seed, fixture.options);
      const alleys = model.taxilanes.filter((lane) => lane.kind === "alley" && lane.ownerId.startsWith("comp-"));
      const collectors = model.taxilanes.filter((lane) => lane.kind === "collector");
      const throats = model.taxilanes.filter((lane) => lane.kind === "throat");
      expect(collectors.length).toBeGreaterThan(0);
      expect(throats.length).toBeGreaterThanOrEqual(2);
      const terminalStands = model.stands.filter((stand) => stand.ownerId.startsWith("comp-"));
      expect(terminalStands.length).toBeGreaterThan(3);
      for (const stand of terminalStands) {
        expect(alleys.some((lane) => polylineDistance([stand.center], lane.points) < 220)).toBeTrue();
      }
      for (const alley of alleys) {
        expect(collectors.some((collector) => polylineDistance(alley.points, collector.points) < 1)).toBeTrue();
      }
      for (const throat of throats) {
        expect(collectors.some((collector) => polylineDistance(throat.points, collector.points) < 1)).toBeTrue();
        // The throat lane hands off to an apron-throat stub, which the taxiway
        // connectivity invariant ties to the named network.
        expect(model.taxiways.some((t) => t.kind === "apron-throat" && polylineDistance(throat.points, t.points) < 60)).toBeTrue();
      }
    }
  });

  test("every detached satellite declares a bridge/tunnel/at-grade connector", () => {
    const connections = new Set(["bridge", "tunnel", "at-grade"]);
    let satellites = 0;
    for (const fixture of terminalFixtures) {
      const model = generate(fixture.seed, fixture.options);
      for (const component of model.terminal!.components.filter((c) => c.kind === "satellite")) {
        satellites++;
        expect(connections.has(component.connection)).toBeTrue();
      }
    }
    for (let i = 0; i < 20; i++) {
      const model = generate(`satellite-${i}`, { role: "mega-hub", archetype: "satellite" });
      for (const component of model.terminal!.components.filter((c) => c.kind === "satellite")) {
        satellites++;
        expect(connections.has(component.connection)).toBeTrue();
      }
    }
    expect(satellites).toBeGreaterThan(0);
  });

  test("apron outline is derived from stands and taxilanes, not steppedEdge rectangles", () => {
    for (const fixture of terminalFixtures) {
      const model = generate(fixture.seed, fixture.options);
      const terminalAprons = model.aprons.filter((apron) => apron.kind === "terminal");
      expect(terminalAprons.length).toBeGreaterThan(2);
      // Every piece is a recorded derivation (gate band, alley elbow, collector,
      // root residual) — no monolithic apron ids survive.
      for (const apron of terminalAprons) expect(apron.id).toMatch(/^band-/);
      // No single piece is the bounding rectangle of the whole complex.
      const terminalBuildings = model.buildings.filter((b) => b.kind === "terminal" || b.kind === "concourse");
      const hull = {
        minX: Math.min(...terminalBuildings.flatMap((b) => b.polygon.map((p) => p.x))),
        maxX: Math.max(...terminalBuildings.flatMap((b) => b.polygon.map((p) => p.x))),
        minY: Math.min(...terminalBuildings.flatMap((b) => b.polygon.map((p) => p.y))),
        maxY: Math.max(...terminalBuildings.flatMap((b) => b.polygon.map((p) => p.y))),
      };
      for (const apron of terminalAprons) {
        const box = {
          minX: Math.min(...apron.polygon.map((p) => p.x)),
          maxX: Math.max(...apron.polygon.map((p) => p.x)),
          minY: Math.min(...apron.polygon.map((p) => p.y)),
          maxY: Math.max(...apron.polygon.map((p) => p.y)),
        };
        const containsHull = box.minX <= hull.minX && box.maxX >= hull.maxX && box.minY <= hull.minY && box.maxY >= hull.maxY;
        expect(containsHull).toBeFalse();
      }
    }
  });

  test("every silhouette irregularity cites a recorded accretion operation", () => {
    for (const fixture of terminalFixtures) {
      const model = generate(fixture.seed, fixture.options);
      const system = model.terminal!;
      expect(system.accretion.length).toBeGreaterThanOrEqual(2);
      expect(system.accretion.length).toBeLessThanOrEqual(4);
      const ids = new Set(system.components.map((component) => component.id));
      for (const op of system.accretion) {
        expect(op.cause.length).toBeGreaterThan(0);
        expect(ids.has(op.componentId)).toBeTrue();
      }
    }
  });

  test("cargo/GA/RON/deice aprons contain stand rows with taxilane access", () => {
    const rowKinds = new Set(["ga", "cargo", "overflow", "military"]);
    let rows = 0;
    for (let i = 0; i < 20; i++) {
      const model = generate(`district-rows-${i}`);
      for (const apron of model.aprons.filter((a) => rowKinds.has(a.kind))) {
        const standRow = model.stands.filter((stand) => stand.ownerId === apron.id);
        expect(standRow.length).toBeGreaterThanOrEqual(2);
        for (const stand of standRow) expect(touchesPolygon(stand.center, apron.polygon, 30)).toBeTrue();
        const lane = model.taxilanes.find((l) => l.ownerId === apron.id);
        expect(lane).toBeDefined();
        for (const point of lane!.points) expect(touchesPolygon(point, apron.polygon, 30)).toBeTrue();
        rows++;
      }
    }
    expect(rows).toBeGreaterThan(10);
  });
});
