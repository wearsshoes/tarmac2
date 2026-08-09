import type { Point } from "./types";

/** Outline tracing: turning a set of overlapping purposeful pieces into the one
 * articulated boundary a real chart draws.
 *
 * Measured from reference/real-airports/faa (10 charts, 3,860 significant apron
 * paths): a real apron piece has a median of 16 vertices, p75 of 27, and a
 * median of 8 distinct edge directions. Only 7% are rectangle-like (≤5 verts).
 * Building masses are comparable (JFK black p75 = 69 vertices).
 *
 * Emitting one rectangle per purpose — a gate band, an alley elbow, a collector
 * ribbon — produces 100% rectangles at exactly 4 vertices, which is why the
 * generated sheets read as stacked slabs rather than pavement. The fix is to
 * keep authoring pieces by purpose (they carry the reasoning) but to publish
 * their union's traced boundary.
 *
 * Exact polygon booleans are overkill here and fragile on degenerate input. A
 * raster occupancy grid traced with marching squares is robust, and its natural
 * artifact — a stair-stepped boundary — is removed by collinear merging and
 * Douglas-Peucker simplification, which together leave exactly the kind of
 * many-directioned articulated outline the reference shows. */

export interface TraceOptions {
  /** Grid cell size in model units. Smaller = more faithful, slower. */
  cell: number;
  /** Douglas-Peucker tolerance; controls final vertex density. */
  tolerance: number;
  /** Drop traced rings whose area falls below this (specks and pinholes). */
  minArea: number;
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Perpendicular distance simplification (Douglas-Peucker), iterative. */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;
    const a = points[first]!;
    const b = points[last]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const norm = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points[i]!;
      const dist = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / norm;
      if (dist > worst) {
        worst = dist;
        worstIndex = i;
      }
    }
    if (worst > tolerance && worstIndex > 0) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Merge runs of near-collinear edges — removes the raster's stair steps while
 * preserving genuine corners. */
function mergeCollinear(points: Point[], angleTolerance = 0.12): Point[] {
  if (points.length < 4) return points;
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const cur = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const a1 = Math.atan2(cur.y - prev.y, cur.x - prev.x);
    const a2 = Math.atan2(next.y - cur.y, next.x - cur.x);
    let diff = Math.abs(a1 - a2);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > angleTolerance) out.push(cur);
  }
  return out.length >= 3 ? out : points;
}

/** Trace the union boundary of a set of polygons.
 *
 * Returns outer rings only (holes are dropped): on an FAA sheet an enclosed
 * void inside pavement is drawn as its own white feature, not as a hole in the
 * gray, and keeping rings simple keeps every downstream consumer — label
 * placement, overlap tests, the renderer — working on plain polygons. */
export function traceUnion(polygons: Point[][], options: TraceOptions): Point[][] {
  const pieces = polygons.filter((poly) => poly.length >= 3);
  if (pieces.length === 0) return [];

  const all = pieces.flat();
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));

  const { cell } = options;
  // One cell of padding so every mass is enclosed by empty cells; the tracer
  // then never has to special-case a boundary that runs off the grid.
  const cols = Math.ceil((maxX - minX) / cell) + 3;
  const rows = Math.ceil((maxY - minY) / cell) + 3;
  if (cols * rows > 4_000_000) return pieces;
  const originX = minX - cell;
  const originY = minY - cell;

  const grid = new Uint8Array(cols * rows);
  // Sample at cell centres. Scanline fill per polygon is far cheaper than
  // testing every cell against every polygon.
  for (const poly of pieces) {
    const pMinY = Math.min(...poly.map((p) => p.y));
    const pMaxY = Math.max(...poly.map((p) => p.y));
    const r0 = Math.max(0, Math.floor((pMinY - originY) / cell));
    const r1 = Math.min(rows - 1, Math.ceil((pMaxY - originY) / cell));
    for (let r = r0; r <= r1; r++) {
      const y = originY + (r + 0.5) * cell;
      const crossings: number[] = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!;
        const b = poly[j]!;
        if ((a.y > y) !== (b.y > y)) crossings.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
      }
      crossings.sort((m, n) => m - n);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((crossings[k]! - originX) / cell - 0.5));
        const c1 = Math.min(cols - 1, Math.floor((crossings[k + 1]! - originX) / cell - 0.5));
        for (let c = c0; c <= c1; c++) grid[r * cols + c] = 1;
      }
    }
  }

  // Trace every boundary by walking filled-cell edges (Moore-style square
  // tracing on the cell lattice), consuming each edge once.
  const filled = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < cols && r < rows && grid[r * cols + c] === 1;
  const key = (c: number, r: number, side: number) => `${c},${r},${side}`;
  const used = new Set<string>();
  // Side 0=top 1=right 2=bottom 3=left, each an exposed cell edge.
  const corner = (c: number, r: number, side: number): [Point, Point] => {
    const x0 = originX + c * cell;
    const y0 = originY + r * cell;
    const x1 = x0 + cell;
    const y1 = y0 + cell;
    if (side === 0) return [{ x: x0, y: y0 }, { x: x1, y: y0 }];
    if (side === 1) return [{ x: x1, y: y0 }, { x: x1, y: y1 }];
    if (side === 2) return [{ x: x1, y: y1 }, { x: x0, y: y1 }];
    return [{ x: x0, y: y1 }, { x: x0, y: y0 }];
  };
  const neighbourOf = (c: number, r: number, side: number): [number, number] =>
    side === 0 ? [c, r - 1] : side === 1 ? [c + 1, r] : side === 2 ? [c, r + 1] : [c - 1, r];

  const rings: Point[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!filled(c, r)) continue;
      for (let side = 0; side < 4; side++) {
        const [nc, nr] = neighbourOf(c, r, side);
        if (filled(nc, nr)) continue;
        if (used.has(key(c, r, side))) continue;
        // Walk this boundary loop, always keeping filled cells on the left.
        const ring: Point[] = [];
        let cc = c;
        let rr = r;
        let ss = side;
        let guard = 0;
        while (guard++ < cols * rows * 4) {
          if (used.has(key(cc, rr, ss))) break;
          used.add(key(cc, rr, ss));
          const [start] = corner(cc, rr, ss);
          ring.push(start);
          // Turn: try to keep hugging the mass — rotate the exposed side
          // forward, stepping to the neighbouring cell when it is filled.
          const nextSide = (ss + 1) % 4;
          const [fc, fr] = neighbourOf(cc, rr, nextSide);
          if (!filled(fc, fr)) {
            ss = nextSide;
            continue;
          }
          // Step forward into that cell; the edge we came along becomes its
          // corresponding side, unless its own neighbour is filled too.
          const [dc, dr] = neighbourOf(fc, fr, ss);
          if (!filled(dc, dr)) {
            cc = fc;
            rr = fr;
            continue;
          }
          cc = dc;
          rr = dr;
          ss = (ss + 3) % 4;
        }
        if (ring.length >= 4) rings.push(ring);
      }
    }
  }

  const cleaned: Point[][] = [];
  for (const ring of rings) {
    const merged = mergeCollinear(simplify(ring, options.tolerance));
    if (merged.length < 3) continue;
    if (Math.abs(polygonArea(merged)) < options.minArea) continue;
    cleaned.push(polygonArea(merged) < 0 ? merged.slice().reverse() : merged);
  }
  // Drop rings fully contained in a larger ring (holes and re-traced interiors).
  const outer = cleaned.filter((ring, i) => {
    const probe = ring[0]!;
    return !cleaned.some((other, j) => {
      if (i === j || Math.abs(polygonArea(other)) <= Math.abs(polygonArea(ring))) return false;
      return ring.every((p) => pointInPolygon(p.x, p.y, other)) || pointInPolygon(probe.x, probe.y, other);
    });
  });
  return outer.length > 0 ? outer : cleaned;
}
