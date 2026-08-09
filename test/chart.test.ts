import { describe, expect, test } from "bun:test";
import { generate, render } from "../src/engine";
import type { RunwayLifecycle, SiteModel } from "../src/engine";
import { dataAttr, groupContent, hexColors } from "./helpers/svg";

/** Deterministically re-state a runway's lifecycle before rendering: render() is a
 * pure function of the model, so portrayal tests exercise every state directly. */
function withLifecycle(model: SiteModel, index: number, lifecycle: RunwayLifecycle): SiteModel {
  const runways = model.runways.map((runway, i) => (i === index ? { ...runway, lifecycle } : runway));
  return { ...model, runways };
}

describe("chart conventions", () => {
  const model = generate("chart-conventions", { role: "mega-hub" });
  const svg = render(model);

  test("has the FAA margin grammar", () => {
    expect(svg.match(/AIRPORT DIAGRAM/g)?.length).toBe(2);
    // Rotated volume/date strings appear on both side margins.
    expect(svg.match(/[A-Z]{2}-\d, \d{2} [A-Z]{3} \d{4} to \d{2} [A-Z]{3} \d{4}/g)?.length).toBe(2);
  });

  test("AL-nnn (FAA) appears exactly once, in the top margin", () => {
    const hits = [...svg.matchAll(/<text x="(\d+(?:\.\d+)?)" y="(\d+(?:\.\d+)?)"[^>]*>AL-\d+ \(FAA\)<\/text>/g)];
    expect(hits.length).toBe(1);
    expect(Number(hits[0]![2])).toBeLessThan(72);
  });

  test("bottom-left is repeated title + Julian date; bottom-right is city/state above name (ID)", () => {
    const texts = [...svg.matchAll(/<text x="(\d+(?:\.\d+)?)" y="(\d+(?:\.\d+)?)"([^>]*)>([^<]+)<\/text>/g)]
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]), attrs: m[3]!, value: m[4]! }))
      .filter((t) => t.y > 1128);
    const left = texts.filter((t) => !t.attrs.includes("end")).sort((a, b) => a.y - b.y);
    const right = texts.filter((t) => t.attrs.includes("end")).sort((a, b) => a.y - b.y);
    expect(left.map((t) => t.value)).toEqual(["AIRPORT DIAGRAM", model.chartNumber]);
    expect(right[0]!.value).toBe(`${model.identity.city.toUpperCase()}, ${model.identity.state}`);
    expect(right[1]!.value).toBe(`${model.identity.airportName} (${model.identity.id})`);
  });

  test("top-left Julian revision date is a valid YYDDD day-of-year derived from the cycle", () => {
    for (const seed of ["julian-1", "julian-2", "julian-3", "chart-conventions"]) {
      const m = generate(seed);
      expect(m.chartNumber).toMatch(/^\d{5}$/);
      const day = Number(m.chartNumber.slice(2));
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(366);
      // Agrees with the cycle's effectivity start date in the side margins.
      const match = m.cycle.match(/(\d{2}) ([A-Z]{3}) (\d{4})/)!;
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const y = Number(match[3]);
      const start = Date.UTC(y, months.indexOf(match[2]!), Number(match[1]));
      const dayOfYear = Math.round((start - Date.UTC(y, 0, 1)) / 86400000) + 1;
      expect(m.chartNumber).toBe(`${String(y % 100).padStart(2, "0")}${String(dayOfYear).padStart(3, "0")}`);
    }
  });

  test("uses only the chart palette", () => {
    expect(hexColors(svg)).toEqual(new Set(["#000000", "#FFFFFF", "#CFCFCF", "#945101"]));
  });

  test("has solid labeled graticule and topmost hotspots", () => {
    expect(svg.match(/id="graticule"/g)?.length).toBe(1);
    expect(svg.match(/°[\d.]+(?:'|&apos;)[NS]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(svg.match(/°[\d.]+(?:'|&apos;)[EW]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(svg.indexOf('id="hotspots"')).toBeGreaterThan(svg.indexOf('id="runways"'));
  });

  test("open runways render solid black with designators", () => {
    for (const seed of ["p1-a", "p1-b", "p1-c", "chart-conventions"]) {
      const m = generate(seed);
      const out = render(m);
      for (const runway of m.runways.filter((r) => r.lifecycle === "active")) {
        expect(groupContent(out, `runway-${runway.id}`)).toContain(`fill="#000000"`);
      }
    }
  });

  describe("lifecycle portrayal matrix", () => {
    const base = generate("lifecycle-matrix", { role: "regional" });
    const target = base.runways.length - 1; // never the primary
    const runwayGroup = (lifecycle: RunwayLifecycle): string => {
      const restated = withLifecycle(base, target, lifecycle);
      return groupContent(render(restated), `runway-${restated.runways[target]!.id}`)!;
    };

    test("permanently closed = outline + one X per end, no designators or data", () => {
      const group = runwayGroup("closed-permanent");
      expect(group).toContain(`fill="#FFFFFF"`);
      expect(group).not.toContain(`fill="#000000"`);
      // Exactly two X's (one per end), drawn as two-stroke paths.
      expect(group.match(/class="thin"\/>/g)!.length).toBeGreaterThanOrEqual(2);
      expect(group.match(/<path d="M[^"]*M[^"]*" class="thin"\/>/g)?.length).toBe(2);
      expect(group).not.toContain("<text");
    });

    test("removed-but-visible pavement = screened gray + repeated X's", () => {
      const group = runwayGroup("removed");
      expect(group).toContain(`fill="#CFCFCF"`);
      expect(group.match(/<path d="M[^"]*M[^"]*" class="thin"\/>/g)!.length).toBeGreaterThanOrEqual(4);
      expect(group).not.toContain("<text");
    });

    test("new-under-construction = dotted outline only", () => {
      const group = runwayGroup("new-construction");
      expect(group).toContain(`class="dotted"`);
      expect(group).toContain(`fill="none"`);
      expect(group).not.toContain(`fill="#000000"`);
      expect(group).not.toContain("<text");
    });

    test("indefinitely closed keeps designators and a CLOSED label", () => {
      const group = runwayGroup("closed-indefinite");
      expect(group).toContain(`fill="#FFFFFF"`);
      expect(group).toContain(">CLOSED<");
      const designators = base.runways[target]!.ends.map((end) => end.designator).filter(Boolean);
      for (const designator of designators) expect(group).toContain(`>${designator}<`);
    });

    test("repurposed pavement is screened gray with no X's and no data", () => {
      const group = runwayGroup("repurposed");
      expect(group).toContain(`fill="#CFCFCF"`);
      expect(group).not.toContain("<text");
      expect(group.match(/<path d="M[^"]*M[^"]*" class="thin"\/>/g)).toBeNull();
    });
  });

  test("taxiway identifiers are rotated along their taxiway's tangent, folded to remain readable", () => {
    for (const seed of ["tangent-1", "tangent-2", "tangent-3"]) {
      const m = generate(seed, { role: "regional" });
      const out = render(m);
      const group = groupContent(out, "taxiway-labels")!;
      const rotations = [...group.matchAll(/transform="rotate\((-?\d+(?:\.\d+)?) /g)].map((match) => Number(match[1]));
      expect(rotations.length).toBeGreaterThan(0);
      // Every label is folded into the readable range.
      for (const rotation of rotations) expect(Math.abs(rotation)).toBeLessThanOrEqual(90.01);
      // The primary parallel taxiway runs along the wind axis; at least one label
      // must be set along that page tangent (checked via the landscape rule).
      const heading = m.windHeading;
      const rotationDeg = m.runways[0]!.heading >= 45 && m.runways[0]!.heading <= 135 ? 90 : 0;
      const rad = (heading * Math.PI) / 180;
      const axis = { x: Math.sin(rad), y: Math.cos(rad) };
      const rrad = (rotationDeg * Math.PI) / 180;
      const page = { x: axis.x * Math.cos(rrad) - axis.y * Math.sin(rrad), y: -(axis.x * Math.sin(rrad) + axis.y * Math.cos(rrad)) };
      let expected = (Math.atan2(page.y, page.x) * 180) / Math.PI;
      expected = ((expected % 360) + 360) % 360;
      if (expected > 90 && expected < 270) expected -= 180;
      expected = ((expected + 180) % 360) - 180;
      expect(rotations.some((rotation) => Math.abs(rotation - expected) < 2.5)).toBeTrue();
    }
  });

  test("tower and beacon are independent facts; the tower BCN line appears only on collocation", () => {
    let collocated = 0;
    let standalone = 0;
    for (let i = 0; i < 40; i++) {
      const m = generate(`beacon-${i}`, { role: "regional" });
      const out = render(m);
      expect(m.beacon).not.toBeNull();
      const buildingLabels = groupContent(out, "building-labels")!;
      if (m.beacon!.onTower) {
        collocated++;
        expect(out).not.toContain(`id="beacon"`);
        expect(buildingLabels).toContain(">BCN<");
      } else {
        standalone++;
        expect(out).toContain(`id="beacon"`);
      }
    }
    expect(collocated).toBeGreaterThan(0);
    expect(standalone).toBeGreaterThan(0);
  });

  test("FIELD ELEV box carries a dot + leader, or neither when the reach is too far", () => {
    // A leader crossing most of the sheet is worse than no leader, so the box
    // may stand alone — but the dot and its leader are one unit: a dot with no
    // leader points at nothing, a leader with no dot ends nowhere.
    let withLeader = 0;
    for (const seed of ["fe-1", "fe-2", "chart-conventions", "fe-3", "fe-4", "fe-5"]) {
      const group = groupContent(render(generate(seed)), "field-elevation")!;
      expect(group).toContain("FIELD ELEV");
      expect(group.includes("<circle")).toBe(group.includes("<path"));
      if (group.includes("<circle")) withLeader++;
    }
    expect(withLeader).toBeGreaterThan(0);
  });

  test("closed runways carry the closed-runway caution", () => {
    const closedStates = new Set(["closed-indefinite", "closed-permanent", "removed"]);
    for (let i = 0; i < 60; i++) {
      const m = generate(`closed-${i}`);
      const hasClosed = m.runways.some((r) => closedStates.has(r.lifecycle));
      const hasCaution = m.cautions.some((c) => c.includes("CLOSED RWY"));
      expect(hasCaution).toBe(hasClosed);
    }
  });

  test("compact airports use the sheet and furniture moves into whitespace", () => {
    const out = render(generate("LOCALIZER-SIGNAL-76"));
    expect(Number(dataAttr(out, "map-scale"))).toBeGreaterThan(0.14);

    const slots = [...out.matchAll(/data-layout-slot="([^"]+)"/g)].map((match) => match[1]!);
    expect(slots.length).toBeGreaterThanOrEqual(5);
    expect(new Set(slots).size).toBeGreaterThanOrEqual(4);
    expect(slots).toContain("top-left");
    expect(slots).toContain("bottom-left");
  });
});
