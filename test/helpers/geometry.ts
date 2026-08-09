// Shared geometry predicates for test suites. Import engine primitives where an
// export exists; only test-specific composites live here.
import type { SiteModel } from "../../src/engine";
import { pointInPolygon, pointSegmentDistance, runwayEndpoints, segmentIntersection } from "../../src/engine/geometry";

export { pointInPolygon };

export type Pt = { x: number; y: number };

export function polygonArea(polygon: Pt[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

export function polygonIsSane(polygon: Pt[]): boolean {
  if (polygon.length < 3) return false;
  for (const p of polygon) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  return polygonArea(polygon) > 0;
}

/** Distance from a point to the nearest polygon boundary segment. */
export function pointPolygonBoundaryDistance(p: Pt, polygon: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    best = Math.min(best, pointSegmentDistance(p, a, b));
  }
  return best;
}

/** Point is inside the polygon or within eps of its boundary. */
export function touchesPolygon(p: Pt, polygon: Pt[], eps: number): boolean {
  return pointInPolygon(p, polygon) || pointPolygonBoundaryDistance(p, polygon) < eps;
}

/**
 * Full containment check: every vertex inside AND every edge midpoint inside.
 * Stronger than the vertex-only check (catches edges that dip outside a concave
 * container between two inside vertices).
 */
export function polygonContained(inner: Pt[], container: Pt[]): boolean {
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i]!;
    const b = inner[(i + 1) % inner.length]!;
    if (!pointInPolygon(a, container)) return false;
    if (!pointInPolygon({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, container)) return false;
  }
  return true;
}

/** True when the polygons share any area (vertex containment or edge crossing). */
export function polygonsOverlap(a: Pt[], b: Pt[]): boolean {
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return true;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentIntersection(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!)) return true;
    }
  }
  return false;
}

export function clearsRunway(polygon: Pt[], runway: SiteModel["runways"][number], margin = 25): boolean {
  const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
  const clearance = runway.width / 2 + margin;
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return false;
  return polygon.every((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    return pointSegmentDistance(point, a, b) >= clearance && !segmentIntersection(a, b, point, next);
  });
}

/** Number of connected components in the taxiway network (proximity/crossing graph). */
export function taxiwayComponents(model: SiteModel): number {
  const nodes = model.taxiways.map((t) => t.points);
  const adjacent = nodes.map(() => new Set<number>());
  const segmentsIntersect = (a: Pt, b: Pt, c: Pt, d: Pt) => {
    const cross = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);
    return ((abC <= 0 && abD >= 0) || (abC >= 0 && abD <= 0)) && ((cdA <= 0 && cdB >= 0) || (cdA >= 0 && cdB <= 0));
  };
  const connected = (one: Pt[], two: Pt[]) => {
    const threshold = 52;
    for (let i = 0; i < one.length - 1; i++)
      for (let j = 0; j < two.length - 1; j++) if (segmentsIntersect(one[i]!, one[i + 1]!, two[j]!, two[j + 1]!)) return true;
    for (const p of one) for (let k = 0; k < two.length - 1; k++) if (pointSegmentDistance(p, two[k]!, two[k + 1]!) < threshold) return true;
    for (const p of two) for (let k = 0; k < one.length - 1; k++) if (pointSegmentDistance(p, one[k]!, one[k + 1]!) < threshold) return true;
    return false;
  };
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      if (connected(nodes[i]!, nodes[j]!)) {
        adjacent[i]!.add(j);
        adjacent[j]!.add(i);
      }
    }
  let count = 0;
  const seen = new Set<number>();
  for (let i = 0; i < nodes.length; i++) {
    if (seen.has(i)) continue;
    count++;
    const stack = [i];
    while (stack.length) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...adjacent[current]!);
    }
  }
  return count;
}
