import type { Point, Polygon } from "./types";

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, value: number): Point => ({ x: a.x * value, y: a.y * value });
export const length = (a: Point): number => Math.hypot(a.x, a.y);
export const normalize = (a: Point): Point => { const n = length(a) || 1; return scale(a, 1 / n); };
export const perp = (a: Point): Point => ({ x: -a.y, y: a.x });
export const midpoint = (a: Point, b: Point): Point => scale(add(a, b), 0.5);
export const polar = (heading: number, distance = 1): Point => {
  const r = heading * Math.PI / 180;
  return { x: Math.sin(r) * distance, y: Math.cos(r) * distance };
};
export const headingOf = (a: Point, b: Point): number => (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
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

export function sampleQuadratic(a: Point, control: Point, b: Point, count = 8): Point[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    return {
      x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * control.x + t ** 2 * b.x,
      y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * control.y + t ** 2 * b.y,
    };
  });
}

export const runwayEndpoints = (center: Point, heading: number, lengthFt: number): [Point, Point] => {
  const axis = polar(heading, lengthFt / 2);
  return [sub(center, axis), add(center, axis)];
};

export const pointAlong = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function roundedRectPolygon(center: Point, width: number, height: number, radius: number, angle = 0, steps = 3): Polygon {
  const pts: Point[] = [];
  const corners = [
    { x: width / 2 - radius, y: height / 2 - radius, start: 0 },
    { x: -width / 2 + radius, y: height / 2 - radius, start: 90 },
    { x: -width / 2 + radius, y: -height / 2 + radius, start: 180 },
    { x: width / 2 - radius, y: -height / 2 + radius, start: 270 },
  ];
  for (const corner of corners) for (let i = 0; i <= steps; i++) {
    const r = (corner.start + i * 90 / steps) * Math.PI / 180;
    pts.push({ x: center.x + corner.x + Math.cos(r) * radius, y: center.y + corner.y + Math.sin(r) * radius });
  }
  return pts.map((p) => rotate(p, angle, center));
}
