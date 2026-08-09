import type { Point, Polygon } from "./types";

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, value: number): Point => ({ x: a.x * value, y: a.y * value });
export const perp = (a: Point): Point => ({ x: -a.y, y: a.x });
export const polar = (heading: number, distance = 1): Point => {
  const r = heading * Math.PI / 180;
  return { x: Math.sin(r) * distance, y: Math.cos(r) * distance };
};
export const rotate = (p: Point, angle: number, origin: Point = { x: 0, y: 0 }): Point => {
  const r = angle * Math.PI / 180;
  const q = sub(p, origin);
  return add(origin, { x: q.x * Math.cos(r) - q.y * Math.sin(r), y: q.x * Math.sin(r) + q.y * Math.cos(r) });
};
export const rect = (center: Point, width: number, height: number, angle = 0): Polygon => [
  { x: center.x - width / 2, y: center.y - height / 2 },
  { x: center.x + width / 2, y: center.y - height / 2 },
  { x: center.x + width / 2, y: center.y + height / 2 },
  { x: center.x - width / 2, y: center.y + height / 2 },
].map((p) => rotate(p, angle, center));

export const bounds = (points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } => ({
  minX: Math.min(...points.map((p) => p.x)), minY: Math.min(...points.map((p) => p.y)),
  maxX: Math.max(...points.map((p) => p.x)), maxY: Math.max(...points.map((p) => p.y)),
});

export const runwayEndpoints = (center: Point, heading: number, lengthFt: number): [Point, Point] => {
  const axis = polar(heading, lengthFt / 2);
  return [sub(center, axis), add(center, axis)];
};

export const pointAlong = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Intersection point of segments ab and cd, or null. */
export function segmentIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = sub(b, a); const s = sub(d, c);
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return add(a, scale(r, t));
}

export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function polylineDistance(one: Point[], two: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < one.length - 1; i++) for (let j = 0; j < two.length - 1; j++) {
    if (segmentIntersection(one[i]!, one[i + 1]!, two[j]!, two[j + 1]!)) return 0;
  }
  for (const p of one) for (let k = 0; k < two.length - 1; k++) best = Math.min(best, pointSegmentDistance(p, two[k]!, two[k + 1]!));
  for (const p of two) for (let k = 0; k < one.length - 1; k++) best = Math.min(best, pointSegmentDistance(p, one[k]!, one[k + 1]!));
  return best;
}

export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!; const b = polygon[j]!;
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y || 1) + a.x) inside = !inside;
  }
  return inside;
}
