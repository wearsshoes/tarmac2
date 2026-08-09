import { describe, expect, test } from "bun:test";
import { generate } from "../src/engine";
import { fixtures } from "./fixtures/seeds";
import { polygonIsSane, touchesPolygon } from "./helpers/geometry";

// Live checks assert what is already true of the current terminal/apron output.
// The todo block records the Phase 3 acceptance contract from
// terminal-generator-plan.md; each todo flips live in the slice that implements it.

describe("terminal and apron structure (current contract)", () => {
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
  // Hierarchy: typed terminal → component records with parent IDs; counts asserted
  // from records, never from polygon or label counts.
  test.todo("terminal hierarchy is typed: every concourse/satellite has a terminal parent", () => {});

  // Edge roles: every exposed building face classified; gate faces get apron bands.
  test.todo("gate faces carry apron bands; landside courts are never aircraft apron", () => {});

  // Circulation: stands → taxilanes → collectors → throats → named taxiways.
  test.todo("every stand reaches a taxilane, collector, throat, and named taxiway", () => {});

  // Detached components declare their connector type (drawn or not).
  test.todo("every detached satellite declares a bridge/tunnel/at-grade connector", () => {});

  // Apron boundary derives from operations, not the building bounding box.
  test.todo("apron outline is derived from stands and taxilanes, not steppedEdge rectangles", () => {});

  // Accretion: silhouette irregularity traces to recorded growth operations.
  test.todo("every silhouette irregularity cites a recorded accretion operation", () => {});

  // District aprons stop being labeled empty polygons.
  test.todo("cargo/GA/RON/deice aprons contain stand rows with taxilane access", () => {});
});
