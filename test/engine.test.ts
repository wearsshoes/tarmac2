import { describe, expect, test } from "bun:test";
import { generate, render, type SiteModel } from "../src/engine";
import { perp, polar, runwayEndpoints } from "../src/engine/geometry";

const roles = ["basic-ga", "business-ga", "regional", "mid-hub", "major-hub", "mega-hub"] as const;

function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!; const b = polygon[j]!;
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y || 1) + a.x) inside = !inside;
  }
  return inside;
}

function taxiwayComponents(model: SiteModel): number {
  const nodes = model.taxiways.map((t) => t.points);
  const adjacent = nodes.map(() => new Set<number>());
  const segmentDistance = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x; const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const segmentsIntersect = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
    const cross = (p: typeof a, q: typeof a, r: typeof a) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const abC = cross(a, b, c); const abD = cross(a, b, d); const cdA = cross(c, d, a); const cdB = cross(c, d, b);
    return ((abC <= 0 && abD >= 0) || (abC >= 0 && abD <= 0)) && ((cdA <= 0 && cdB >= 0) || (cdA >= 0 && cdB <= 0));
  };
  const connected = (one: typeof nodes[number], two: typeof nodes[number]) => {
    const threshold = 52;
    for (let i = 0; i < one.length - 1; i++) for (let j = 0; j < two.length - 1; j++) if (segmentsIntersect(one[i]!, one[i + 1]!, two[j]!, two[j + 1]!)) return true;
    for (const p of one) for (let k = 0; k < two.length - 1; k++) if (segmentDistance(p, two[k]!, two[k + 1]!) < threshold) return true;
    for (const p of two) for (let k = 0; k < one.length - 1; k++) if (segmentDistance(p, one[k]!, one[k + 1]!) < threshold) return true;
    return false;
  };
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (connected(nodes[i]!, nodes[j]!)) { adjacent[i]!.add(j); adjacent[j]!.add(i); }
  }
  let count = 0; const seen = new Set<number>();
  for (let i = 0; i < nodes.length; i++) {
    if (seen.has(i)) continue;
    count++; const stack = [i];
    while (stack.length) { const current = stack.pop()!; if (seen.has(current)) continue; seen.add(current); stack.push(...adjacent[current]!); }
  }
  return count;
}

describe("deterministic generation", () => {
  test("same seed creates byte-identical model and SVG", () => {
    const one = generate("BRAVO-NORTH-17");
    const two = generate("BRAVO-NORTH-17");
    expect(one).toEqual(two);
    expect(render(one)).toBe(render(two));
  });

  test("same seed is byte-identical across every role override", () => {
    for (const role of roles) {
      expect(render(generate("CROSS-ROLE-9", { role }))).toBe(render(generate("CROSS-ROLE-9", { role })));
    }
  });

  test("different seeds produce a varied population", () => {
    const models = Array.from({ length: 40 }, (_, i) => generate(`seed-${i}`));
    const ids = new Set(models.map((m) => m.identity.id));
    expect(ids.size).toBeGreaterThan(32);
    // P4 anti-mode-collapse: wind axes and district sides vary across the population.
    const headings = new Set(models.map((m) => Math.round(m.windHeading / 15)));
    expect(headings.size).toBeGreaterThan(5);
    const cities = new Set(models.map((m) => m.identity.city));
    expect(cities.size).toBeGreaterThan(30);
  });

  test("200-seed population remains finite, unique, and renderable", () => {
    for (let i = 0; i < 200; i++) {
      const model = generate(`population-${i}`);
      expect(new Set(model.runways.map((runway) => runway.id)).size).toBe(model.runways.length);
      expect(model.protectionZones.length).toBe(model.runways.length * 2);
      for (const zone of model.protectionZones) {
        for (const point of zone) expect(pointInPolygon(point, model.parcel)).toBeTrue();
        for (const building of model.buildings) {
          const center = building.polygon.reduce((sum, point) => ({ x: sum.x + point.x / building.polygon.length, y: sum.y + point.y / building.polygon.length }), { x: 0, y: 0 });
          if (pointInPolygon(center, zone)) throw new Error(`${model.seed}: ${building.id} intrudes into an RPZ`);
          for (const point of building.polygon) if (pointInPolygon(point, zone)) throw new Error(`${model.seed}: ${building.id} crosses an RPZ boundary`);
        }
      }
      const svg = render(model);
      expect(svg).not.toContain("NaN");
      expect(svg.startsWith("<?xml")).toBeTrue();
    }
  });
});

describe("airport constraints", () => {
  for (const role of roles) test(`${role} has valid runway and taxiway geometry`, () => {
    const model = generate(`property-${role}`, { role });
    const legal = /^[A-HJ-NP-WYZ](?:[1-9])?$/;
    for (const runway of model.runways.filter((r) => !r.closed)) {
      expect(Math.abs(((runway.ends[1].magneticHeading - runway.ends[0].magneticHeading + 360) % 360) - 180)).toBeLessThan(0.01);
      const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(runway.length, 5);
      expect(model.taxiways.some((t) => t.kind === "parallel" && t.runwayId === runway.id)).toBeTrue();
    }
    for (const taxiway of model.taxiways.filter((t) => t.kind !== "apron-throat")) expect(taxiway.name).toMatch(legal);
    expect(taxiwayComponents(model)).toBe(1);
  });

  test("field elevation is the highest point on a runway", () => {
    for (let i = 0; i < 40; i++) {
      const model = generate(`elev-${i}`);
      const endElevations = model.runways.filter((r) => !r.closed).flatMap((r) => r.ends.map((e) => e.elevation));
      expect(Math.max(...endElevations)).toBe(model.identity.elevation);
    }
  });

  test("parallel runway numbering and separations use standard families", () => {
    const model = generate("parallel-3", { role: "major-hub" });
    const headings = new Set(model.runways.map((r) => Math.round(r.heading)));
    expect(headings.size).toBe(1);
    const suffixes = model.runways.map((r) => r.ends[0].designator.slice(-1)).sort();
    expect(suffixes).toEqual(["C", "L", "R"]);
    // L and R must be mirrored on the reciprocal ends.
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

  test("large airports vary between parallel banks and mixed runway families", () => {
    const mixedCounts = new Map<string, number>();
    for (const role of ["mid-hub", "major-hub", "mega-hub"] as const) {
      let mixed = 0;
      for (let i = 0; i < 80; i++) {
        const model = generate(`topology-${i}`, { role });
        const headings = [...new Set(model.runways.filter((runway) => !runway.closed).map((runway) => Math.round(runway.heading)))];
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

  test("mega-hub banks renumber in chunks (LAX/ATL pattern)", () => {
    const model = generate("chunk-check", { role: "mega-hub" });
    const bank = model.runways.filter((r) => !r.closed);
    expect(bank.length).toBe(4);
    const numbers = new Set(bank.map((r) => Number.parseInt(r.ends[0].designator, 10)));
    expect(numbers.size).toBe(2);
    const [low, high] = [...numbers].sort((a, b) => a - b);
    expect((low! % 36) + 1).toBe(high!);
  });

  test("hotspots stay 500 ft apart and LAHSO caps at 6", () => {
    for (let i = 0; i < 30; i++) {
      const model = generate(`hs-${i}`);
      for (let a = 0; a < model.hotspots.length; a++) for (let b = a + 1; b < model.hotspots.length; b++) {
        const pa = model.hotspots[a]!.point; const pb = model.hotspots[b]!.point;
        expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeGreaterThanOrEqual(500);
      }
      expect(model.lahso.length).toBeLessThanOrEqual(6);
    }
  });
});

describe("chart conventions", () => {
  const model = generate("chart-conventions", { role: "mega-hub" });
  const svg = render(model);

  test("has the FAA margin grammar", () => {
    expect(svg.match(/AIRPORT DIAGRAM/g)?.length).toBe(2);
    expect(svg.match(/AL-\d+ \(FAA\)/g)?.length).toBeGreaterThanOrEqual(2);
    // Rotated volume/date strings appear on both side margins.
    expect(svg.match(/[A-Z]{2}-\d, \d{2} [A-Z]{3} \d{4} to \d{2} [A-Z]{3} \d{4}/g)?.length).toBe(2);
  });

  test("uses only the chart palette", () => {
    const colors = new Set(svg.match(/#[0-9A-Fa-f]{6}/g));
    expect(colors).toEqual(new Set(["#000000", "#FFFFFF", "#CFCFCF", "#945101"]));
  });

  test("has solid labeled graticule and topmost hotspots", () => {
    expect(svg.match(/id="graticule"/g)?.length).toBe(1);
    expect(svg.match(/°[\d.]+(?:'|&apos;)[NS]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(svg.match(/°[\d.]+(?:'|&apos;)[EW]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(svg.indexOf('id="hotspots"')).toBeGreaterThan(svg.indexOf('id="runways"'));
  });

  test("every open runway renders as a solid black bar", () => {
    for (const seed of ["p1-a", "p1-b", "p1-c", "chart-conventions"]) {
      const m = generate(seed);
      const out = render(m);
      for (const runway of m.runways.filter((r) => !r.closed)) {
        const group = out.match(new RegExp(`<g id="runway-${runway.id}">(.*?)</g>`, "s"))?.[1] ?? "";
        expect(group).toContain(`fill="#000000"`);
      }
      // Closed runways draw as open outlines, never solid.
      for (const runway of m.runways.filter((r) => r.closed)) {
        const group = out.match(new RegExp(`<g id="runway-${runway.id}">(.*?)</g>`, "s"))?.[1] ?? "";
        expect(group).toContain(`fill="#FFFFFF"`);
        expect(group).not.toContain(`fill="#000000"`);
      }
    }
  });

  test("closed runways carry the closed-runway caution", () => {
    for (let i = 0; i < 60; i++) {
      const model = generate(`closed-${i}`);
      const hasClosed = model.runways.some((r) => r.closed);
      const hasCaution = model.cautions.some((c) => c.includes("CLOSED RWY"));
      expect(hasCaution).toBe(hasClosed);
    }
  });

  test("compact airports use the sheet and furniture moves into whitespace", () => {
    const out = render(generate("LOCALIZER-SIGNAL-76"));
    const scale = Number(out.match(/data-map-scale="([\d.]+)"/)?.[1]);
    expect(scale).toBeGreaterThan(0.14);

    const slots = [...out.matchAll(/data-layout-slot="([^"]+)"/g)].map((match) => match[1]!);
    expect(slots.length).toBeGreaterThanOrEqual(5);
    expect(new Set(slots).size).toBeGreaterThanOrEqual(4);
    expect(slots).toContain("top-left");
    expect(slots).toContain("bottom-left");
  });
});
