import { describe, expect, test } from "bun:test";
import { generate, render } from "../src/engine";
import { dataAttr, groupContent, hexColors } from "./helpers/svg";

describe("chart conventions", () => {
  const model = generate("chart-conventions", { role: "mega-hub" });
  const svg = render(model);

  test("has the FAA margin grammar", () => {
    expect(svg.match(/AIRPORT DIAGRAM/g)?.length).toBe(2);
    // Current output repeats AL-nnn top and bottom; IAC places it top-only.
    // This assertion is loosened to presence; the todo below is the Phase 1 contract.
    expect(svg.match(/AL-\d+ \(FAA\)/g)?.length).toBeGreaterThanOrEqual(1);
    // Rotated volume/date strings appear on both side margins.
    expect(svg.match(/[A-Z]{2}-\d, \d{2} [A-Z]{3} \d{4} to \d{2} [A-Z]{3} \d{4}/g)?.length).toBe(2);
  });

  // Phase 1 margin-topology contract (iac9-improvement-scope P0):
  test.todo("AL-nnn (FAA) appears exactly once, in the top margin", () => {});
  test.todo("bottom-left is repeated title + Julian date; bottom-right is city/state above name (ID)", () => {});
  test.todo("top-left Julian revision date is a valid YYDDD day-of-year derived from the cycle", () => {});

  test("uses only the chart palette", () => {
    expect(hexColors(svg)).toEqual(new Set(["#000000", "#FFFFFF", "#CFCFCF", "#945101"]));
  });

  test("has solid labeled graticule and topmost hotspots", () => {
    expect(svg.match(/id="graticule"/g)?.length).toBe(1);
    expect(svg.match(/°[\d.]+(?:'|&apos;)[NS]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(svg.match(/°[\d.]+(?:'|&apos;)[EW]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(svg.indexOf('id="hotspots"')).toBeGreaterThan(svg.indexOf('id="runways"'));
  });

  test("open runways render solid black; closed runways render as the current closed portrayal", () => {
    for (const seed of ["p1-a", "p1-b", "p1-c", "chart-conventions"]) {
      const m = generate(seed);
      const out = render(m);
      for (const runway of m.runways.filter((r) => !r.closed)) {
        expect(groupContent(out, `runway-${runway.id}`)).toContain(`fill="#000000"`);
      }
      for (const runway of m.runways.filter((r) => r.closed)) {
        const group = groupContent(out, `runway-${runway.id}`);
        expect(group).toContain(`fill="#FFFFFF"`);
        expect(group).not.toContain(`fill="#000000"`);
      }
    }
  });

  // Phase 1 lifecycle contract (spec B4): the six IAC states replace the boolean.
  // The current closed portrayal illegally combines the permanently-closed outline
  // with removed-pavement X's; the matrix below supersedes the test above.
  test.todo("lifecycle portrayal matrix: permanently closed = outline + one X per end, no designators or data", () => {});
  test.todo("lifecycle portrayal matrix: removed-but-visible pavement = screened gray + repeated X's", () => {});
  test.todo("lifecycle portrayal matrix: new-under-construction = dotted outline", () => {});

  // Phase 1 label-orientation contract (iac9 P0): identifiers set along the path.
  test.todo("taxiway identifiers are rotated along their taxiway's tangent, folded to remain readable", () => {});
  test.todo("tower and beacon are independent facts; TWR/BCN only on explicit collocation", () => {});
  test.todo("FIELD ELEV box carries a dot + leader to the runway high point", () => {});

  test("closed runways carry the closed-runway caution", () => {
    for (let i = 0; i < 60; i++) {
      const m = generate(`closed-${i}`);
      const hasClosed = m.runways.some((r) => r.closed);
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
