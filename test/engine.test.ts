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

  test("different streams produce a varied population", () => {
    const ids = new Set(Array.from({ length: 40 }, (_, i) => generate(`seed-${i}`).identity.id));
    expect(ids.size).toBeGreaterThan(35);
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
    for (const runway of model.runways) {
      expect(Math.abs(((runway.ends[1].magneticHeading - runway.ends[0].magneticHeading + 360) % 360) - 180)).toBeLessThan(0.01);
      const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(runway.length, 5);
      expect(model.taxiways.some((t) => t.kind === "parallel" && t.runwayId === runway.id)).toBeTrue();
    }
    for (const taxiway of model.taxiways.filter((t) => t.kind !== "apron-throat")) expect(taxiway.name).toMatch(legal);
    expect(taxiwayComponents(model)).toBe(1);
  });

  test("parallel runway numbering and separations use standard families", () => {
    const model = generate("parallel-bank", { role: "major-hub" });
    const headings = new Set(model.runways.map((r) => Math.round(r.heading)));
    expect(headings.size).toBe(1);
    expect(model.runways.map((r) => r.ends[0].designator.slice(-1))).toEqual(["L", "C", "R"]);
    const lateral = perp(polar(model.runways[0]!.heading));
    const separations = model.runways.slice(1).map((r, i) => Math.round(Math.abs((r.center.x - model.runways[i]!.center.x) * lateral.x + (r.center.y - model.runways[i]!.center.y) * lateral.y)));
    expect(separations.every((s) => Math.abs(s - 2500) < 100)).toBeTrue();
  });
});

describe("chart conventions", () => {
  const svg = render(generate("chart-conventions", { role: "mega-hub" }));
  test("has the FAA margin grammar", () => {
    expect(svg.match(/AIRPORT DIAGRAM/g)?.length).toBe(2);
    expect(svg.match(/AL-\d+ \(FAA\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(svg.match(/to 05 SEP 2026/g)?.length).toBe(2);
  });
  test("uses only the chart palette", () => {
    const colors = new Set(svg.match(/#[0-9A-Fa-f]{6}/g));
    expect(colors).toEqual(new Set(["#000000", "#FFFFFF", "#CFCFCF", "#945101"]));
  });
  test("has solid labeled graticule and topmost hotspots", () => {
    expect(svg.match(/id="graticule"/g)?.length).toBe(1);
    expect(svg.match(/°\d{2}(?:'|&apos;)[NW]/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(svg.indexOf('id="hotspots"')).toBeGreaterThan(svg.indexOf('id="runways"'));
    expect(svg).not.toContain("stroke-dasharray" + "=" + '"4');
  });
});
