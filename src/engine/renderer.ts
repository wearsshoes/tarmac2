import { add, bounds, perp, pointAlong, polar, rect, rotate, runwayEndpoints, scale as vscale, segmentIntersection, sub } from "./geometry";
import type { Point, Polygon, Runway, SiteModel, Taxiway } from "./types";

const W = 900;
const H = 1200;
const FRAME = { x: 38, y: 72, w: 824, h: 1056 };
const PLOT = { x: 62, y: 102, w: 776, h: 970 };
const BLACK = "#000000";
const WHITE = "#FFFFFF";
const GRAY = "#CFCFCF";
const BROWN = "#945101";
const FEET_PER_MINUTE = 6076;

const esc = (value: string): string => value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);
const num = (value: number): string => Number(value.toFixed(2)).toString();

class Projection {
  scaleValue: number;
  rotation: number;
  private center: Point;

  constructor(model: SiteModel, fill = 0.72) {
    const primary = model.runways[0]!;
    // Predominantly E/W fields use the FAA landscape convention: north points left.
    this.rotation = primary.heading >= 45 && primary.heading <= 135 ? 90 : 0;
    const content = [
      ...model.runways.flatMap((r) => rect(r.center, r.width + 200, r.length + 500, -r.heading)),
      ...model.aprons.flatMap((a) => a.polygon),
      ...model.buildings.flatMap((b) => b.polygon),
      ...model.taxiways.flatMap((t) => t.points),
    ].map((p) => rotate(p, this.rotation));
    const box = bounds(content);
    this.center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    // Fit the actual airport, not an arbitrary 12,500-foot canvas. The latitude cap
    // still preserves a little more than one whole minute across the plot, while
    // allowing compact fields to use the sheet instead of collapsing at its center.
    const fitH = (PLOT.h * fill) / Math.max(1, box.maxY - box.minY);
    const fitW = (PLOT.w * Math.min(0.84, fill + 0.1)) / Math.max(1, box.maxX - box.minX);
    const cap = PLOT.h / (FEET_PER_MINUTE * 1.04);
    this.scaleValue = Math.min(fitH, fitW, cap);
  }

  point(p: Point): Point {
    const q = rotate(p, this.rotation);
    return { x: W / 2 + (q.x - this.center.x) * this.scaleValue, y: PLOT.y + PLOT.h / 2 - (q.y - this.center.y) * this.scaleValue };
  }
  distance(feet: number): number { return feet * this.scaleValue; }
  polygon(points: Polygon): string { return points.map((p) => { const q = this.point(p); return `${num(q.x)},${num(q.y)}`; }).join(" "); }
  path(points: Point[]): string { return points.map((p, i) => { const q = this.point(p); return `${i ? "L" : "M"}${num(q.x)} ${num(q.y)}`; }).join(" "); }
  /** Page-space direction (unit) of a model-space direction. */
  direction(d: Point): Point {
    const q = rotate(d, this.rotation);
    const len = Math.hypot(q.x, q.y) || 1;
    return { x: q.x / len, y: -q.y / len };
  }
}

type Box = { x: number; y: number; w: number; h: number };

type FurnitureSlot = "top-left" | "top-center" | "top-right" | "center-left" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right" | "free-grid";
type Placement = Box & { slot: FurnitureSlot };

interface FurniturePlan {
  comm: Placement;
  fieldElev: Placement;
  magVar: Placement;
  caution: Placement;
  pcn: Placement;
  notes?: Placement;
  ramp?: Placement;
  lighting?: Placement;
  hotspotTable?: Placement;
  legend?: Placement;
  forced: number;
}

const intersects = (a: Box, b: Box): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inflate = (box: Box, amount: number): Box => ({ x: box.x - amount, y: box.y - amount, w: box.w + amount * 2, h: box.h + amount * 2 });

function boxDistance(a: Box, b: Box): number {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.hypot(dx, dy);
}

function pageBounds(points: Point[], projection: Projection, padding = 0): Box {
  const box = bounds(points.map((point) => projection.point(point)));
  return { x: box.minX - padding, y: box.minY - padding, w: box.maxX - box.minX + padding * 2, h: box.maxY - box.minY + padding * 2 };
}

/** Reserve small boxes along a line instead of one large diagonal AABB. This leaves
 * the genuine corner whitespace around crossing runways available to chart furniture. */
function sampledPathBoxes(points: Point[], projection: Projection, radius: number): Box[] {
  const boxes: Box[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = projection.point(points[i]!);
    const b = projection.point(points[i + 1]!);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / Math.max(10, radius * 1.5)));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      boxes.push({ x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 });
    }
  }
  return boxes;
}

/** Packs movable sheet furniture into whitespace around the projected airfield. */
class WhitespacePacker {
  private placed: Box[] = [];
  private readonly cell = 6;
  private readonly columns = Math.ceil(FRAME.w / this.cell);
  private readonly rows = Math.ceil(FRAME.h / this.cell);
  private readonly summed: Uint32Array;
  forced = 0;

  constructor(private readonly obstacles: Box[]) {
    const stride = this.columns + 1;
    const occupied = new Uint8Array(this.columns * this.rows);
    for (const obstacle of obstacles) {
      const padded = inflate(obstacle, 5);
      const x0 = Math.max(0, Math.floor((padded.x - FRAME.x) / this.cell));
      const x1 = Math.min(this.columns - 1, Math.floor((padded.x + padded.w - FRAME.x) / this.cell));
      const y0 = Math.max(0, Math.floor((padded.y - FRAME.y) / this.cell));
      const y1 = Math.min(this.rows - 1, Math.floor((padded.y + padded.h - FRAME.y) / this.cell));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) occupied[y * this.columns + x] = 1;
    }
    this.summed = new Uint32Array((this.columns + 1) * (this.rows + 1));
    for (let y = 1; y <= this.rows; y++) {
      let row = 0;
      for (let x = 1; x <= this.columns; x++) {
        row += occupied[(y - 1) * this.columns + x - 1]!;
        this.summed[y * stride + x] = this.summed[(y - 1) * stride + x]! + row;
      }
    }
  }

  private slot(slot: Exclude<FurnitureSlot, "free-grid">, w: number, h: number): Placement {
    const left = FRAME.x + 14;
    const right = FRAME.x + FRAME.w - w - 14;
    const top = FRAME.y + 14;
    const bottom = FRAME.y + FRAME.h - h - 14;
    const centerX = W / 2 - w / 2;
    const centerY = FRAME.y + FRAME.h / 2 - h / 2;
    const map: Record<Exclude<FurnitureSlot, "free-grid">, Point> = {
      "top-left": { x: left, y: top }, "top-center": { x: centerX, y: top }, "top-right": { x: right, y: top },
      "center-left": { x: left, y: centerY }, "center-right": { x: right, y: centerY },
      "bottom-left": { x: left, y: bottom }, "bottom-center": { x: centerX, y: bottom }, "bottom-right": { x: right, y: bottom },
    };
    return { ...map[slot], w, h, slot };
  }

  private fits(box: Box): boolean {
    return box.x >= FRAME.x + 8 && box.y >= FRAME.y + 8 && box.x + box.w <= FRAME.x + FRAME.w - 8 && box.y + box.h <= FRAME.y + FRAME.h - 8 &&
      !this.airfieldOverlap(inflate(box, 5)) && !this.placed.some((placed) => intersects(inflate(box, 5), placed));
  }

  private airfieldOverlap(box: Box): boolean {
    const stride = this.columns + 1;
    const x0 = Math.max(0, Math.min(this.columns, Math.floor((box.x - FRAME.x) / this.cell)));
    const x1 = Math.max(0, Math.min(this.columns, Math.ceil((box.x + box.w - FRAME.x) / this.cell)));
    const y0 = Math.max(0, Math.min(this.rows, Math.floor((box.y - FRAME.y) / this.cell)));
    const y1 = Math.max(0, Math.min(this.rows, Math.ceil((box.y + box.h - FRAME.y) / this.cell)));
    const count = this.summed[y1 * stride + x1]! - this.summed[y0 * stride + x1]! - this.summed[y1 * stride + x0]! + this.summed[y0 * stride + x0]!;
    return count > 0;
  }

  private clearance(box: Box): number {
    const all = [...this.obstacles, ...this.placed];
    return all.length ? Math.min(...all.map((other) => boxDistance(box, other))) : 999;
  }

  place(w: number, h: number, slots: Array<Exclude<FurnitureSlot, "free-grid">>): Placement {
    const preferred = slots.map((slot) => this.slot(slot, w, h)).filter((box) => this.fits(box));
    if (preferred.length > 0) {
      // Among semantically valid locations, use the emptiest one. The slot order is
      // only a tie-break, so different airport silhouettes naturally move the blocks.
      const ranked = preferred.map((box, index) => ({ box, index, clearance: this.clearance(box) }))
        .sort((a, b) => b.clearance - a.clearance || a.index - b.index);
      const selected = ranked[0]!.box;
      this.placed.push(selected);
      return selected;
    }

    const candidates: Placement[] = [];
    for (let y = FRAME.y + 10; y <= FRAME.y + FRAME.h - h - 10; y += 12) {
      for (let x = FRAME.x + 10; x <= FRAME.x + FRAME.w - w - 10; x += 12) candidates.push({ x, y, w, h, slot: "free-grid" });
    }
    const preferredTargets = slots.map((slot) => this.slot(slot, w, h));
    const preferenceDistance = (box: Box): number => Math.min(...preferredTargets.map((target) => Math.hypot(box.x - target.x, box.y - target.y)));
    candidates.sort((a, b) => preferenceDistance(a) - preferenceDistance(b));
    const clear = candidates.find((box) => this.fits(box));
    if (clear) {
      this.placed.push(clear);
      return clear;
    }

    // A dense chart can exhaust every clean rectangle. Keep the least-overlapping
    // result as a signal to the outer scale solver, which retries at a smaller fill.
    const overlapArea = (box: Box): number => [...this.obstacles, ...this.placed].reduce((sum, other) => {
      const x = Math.max(0, Math.min(box.x + box.w, other.x + other.w) - Math.max(box.x, other.x));
      const y = Math.max(0, Math.min(box.y + box.h, other.y + other.h) - Math.max(box.y, other.y));
      return sum + x * y;
    }, 0);
    candidates.sort((a, b) => overlapArea(a) - overlapArea(b));
    const selected = candidates[0] ?? { x: FRAME.x + 10, y: FRAME.y + 10, w, h, slot: "free-grid" as const };
    this.placed.push(selected);
    this.forced++;
    return selected;
  }
}

/** Label placement: spatial first-fit with a tiered drop policy (harvest H7). */
class LabelPlacer {
  boxes: Box[] = [];
  private labelBoxes: Box[] = [];
  forcedOverlaps = 0;
  forcedOverlapLabels: string[] = [];
  reserve(box: Box): void { this.boxes.push(box); }
  overlaps(a: Box): boolean { return this.boxes.some((b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y); }
  inFrame(box: Box): boolean { return box.x > FRAME.x + 2 && box.x + box.w < FRAME.x + FRAME.w - 2 && box.y > FRAME.y + 2 && box.y + box.h < FRAME.y + FRAME.h - 2; }

  boxFor(point: Point, text: string, size: number, rotation = 0): Box {
    // Short taxiway identifiers should reserve their glyph width plus halo, not the
    // former hard 18-unit minimum that made adjacent connector labels impossible.
    const w = Math.max(6, text.length * size * 0.6) + 4;
    const h = size + 3;
    const angle = (rotation * Math.PI) / 180;
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    const centerOffsetY = -size * 0.35;
    const cx = point.x - centerOffsetY * sin;
    const cy = point.y + centerOffsetY * cos;
    const rw = Math.abs(w * cos) + Math.abs(h * sin);
    const rh = Math.abs(w * sin) + Math.abs(h * cos);
    return { x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh };
  }

  claim(point: Point, text: string, size: number, rotation = 0): boolean {
    const box = this.boxFor(point, text, size, rotation);
    if (!this.inFrame(box) || this.overlaps(box)) return false;
    this.reserve(box);
    this.labelBoxes.push(box);
    return true;
  }

  /** Try candidate offsets around the anchor; returns placement or null. */
  try(anchor: Point, text: string, size: number, candidates: Point[], rotation = 0): { point: Point; leader: boolean } | null {
    for (const [i, offset] of candidates.entries()) {
      const point = { x: anchor.x + offset.x, y: anchor.y + offset.y };
      if (this.claim(point, text, size, rotation)) return { point, leader: i > 0 && Math.hypot(offset.x, offset.y) > 14 };
    }
    return null;
  }

  /** Essential labels use the least-conflicting in-frame fallback, not candidate 0. */
  forceBest(anchor: Point, text: string, size: number, candidates: Point[], rotation = 0): Point {
    const overlapArea = (box: Box, others: Box[]): number => others.reduce((sum, other) => {
      const x = Math.max(0, Math.min(box.x + box.w, other.x + other.w) - Math.max(box.x, other.x));
      const y = Math.max(0, Math.min(box.y + box.h, other.y + other.h) - Math.max(box.y, other.y));
      return sum + x * y;
    }, 0);
    const ranked = candidates.map((offset, index) => {
      const point = { x: anchor.x + offset.x, y: anchor.y + offset.y };
      const box = this.boxFor(point, text, size, rotation);
      return {
        point, box, index,
        labelOverlap: this.inFrame(box) ? overlapArea(box, this.labelBoxes) : Number.POSITIVE_INFINITY,
        overlap: this.inFrame(box) ? overlapArea(box, this.boxes) : Number.POSITIVE_INFINITY,
      };
    }).sort((a, b) => a.labelOverlap - b.labelOverlap || a.overlap - b.overlap || a.index - b.index);
    const selected = ranked[0] ?? { point: anchor, box: this.boxFor(anchor, text, size, rotation), labelOverlap: 1 };
    if (selected.labelOverlap > 0) { this.forcedOverlaps++; this.forcedOverlapLabels.push(text); }
    this.reserve(selected.box);
    this.labelBoxes.push(selected.box);
    return selected.point;
  }

  /** Prefer a direct leader, then orthogonal doglegs, while avoiding reserved text. */
  leaderPath(from: Point, to: Point): Point[] {
    const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const candidates: Point[][] = [
      [from, to],
      [from, { x: from.x, y: to.y }, to],
      [from, { x: to.x, y: from.y }, to],
      [from, { x: midpoint.x, y: from.y }, { x: midpoint.x, y: to.y }, to],
      [from, { x: from.x, y: midpoint.y }, { x: to.x, y: midpoint.y }, to],
    ];
    const contains = (box: Box, point: Point): boolean => point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
    const crosses = (a: Point, b: Point, box: Box): boolean => {
      if (contains(box, a) || contains(box, b)) return false;
      const corners = [
        { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y },
        { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h },
      ];
      return corners.some((corner, index) => segmentIntersection(a, b, corner, corners[(index + 1) % corners.length]!));
    };
    const score = (points: Point[]): number => {
      let collisions = 0; let length = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]!; const b = points[i + 1]!;
        collisions += this.labelBoxes.filter((box) => crosses(a, b, box)).length;
        length += Math.hypot(b.x - a.x, b.y - a.y);
      }
      return collisions * 10000 + length;
    };
    return candidates.sort((a, b) => score(a) - score(b))[0]!;
  }

  reserveLeader(points: Point[]): void {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!; const b = points[i + 1]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12));
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t;
        this.reserve({ x: x - 1.5, y: y - 1.5, w: 3, h: 3 });
      }
    }
  }
}

function leaderPath(placer: LabelPlacer, from: Point, to: Point): string {
  const points = placer.leaderPath(from, to);
  placer.reserveLeader(points);
  return `<path d="${points.map((point, index) => `${index ? "L" : "M"}${num(point.x)} ${num(point.y)}`).join("")}"/>`;
}

function text(x: number, y: number, value: string, attrs = ""): string {
  return `<text x="${num(x)}" y="${num(y)}" ${attrs}>${esc(value)}</text>`;
}

const RING = [{ x: 0, y: 0 }, { x: 16, y: -13 }, { x: -16, y: -13 }, { x: 17, y: 14 }, { x: -17, y: 14 }, { x: 30, y: -26 }, { x: -30, y: -26 }, { x: 30, y: 28 }, { x: -30, y: 28 }, { x: 0, y: -30 }, { x: 0, y: 30 }];

/** Degree-minute label, keeping a .5 fraction when the graticule step is sub-minute. */
function fmtGeo(minutesTotal: number, positive: string, negative: string): string {
  const suffix = minutesTotal < 0 ? negative : positive;
  const abs = Math.abs(minutesTotal);
  const degrees = Math.floor(abs / 60);
  const minutes = abs - degrees * 60;
  const whole = Math.floor(minutes + 1e-6);
  const fraction = minutes - whole;
  const minuteText = fraction > 0.01 ? minutes.toFixed(1) : String(whole).padStart(2, "0");
  return `${degrees}°${minuteText}'${suffix}`;
}
const fmtLat = (minutesTotal: number): string => fmtGeo(minutesTotal, "N", "S");
const fmtLon = (minutesTotal: number): string => fmtGeo(minutesTotal, "E", "W");

/** Graticule drawn from the airport's actual lat/lon at true page scale (spec B3).
 * Labels are suppressed where they would sit under furniture blocks (harvest H7). */
function graticule(model: SiteModel, projection: Projection, placer: LabelPlacer): string {
  const { lat, lon } = model.identity;
  const spanMinutes = PLOT.h / projection.distance(FEET_PER_MINUTE);
  const step = [0.25, 0.5, 1, 2, 5].find((s) => spanMinutes / s <= 5) ?? 5;
  let out = `<g id="graticule" class="grat">`;
  const clamp = { x0: PLOT.x, x1: PLOT.x + PLOT.w, y0: PLOT.y, y1: PLOT.y + PLOT.h };
  const lonScale = Math.max(0.2, Math.cos((lat * Math.PI) / 180));

  const drawLine = (isLat: boolean, minuteValue: number): string => {
    const offsetFeet = isLat
      ? (minuteValue - lat * 60) * FEET_PER_MINUTE
      : (minuteValue - lon * 60) * FEET_PER_MINUTE * lonScale;
    const modelPoint = isLat ? { x: 0, y: offsetFeet } : { x: offsetFeet, y: 0 };
    const modelDir = isLat ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const p = projection.point(modelPoint);
    const d = projection.direction(modelDir);
    const horizontal = Math.abs(d.x) > Math.abs(d.y);
    let line = "";
    const label = isLat ? fmtLat(minuteValue) : fmtLon(minuteValue);
    const tryLabel = (x: number, y: number, anchor: "start" | "end"): string => {
      const w = label.length * 4.2;
      const box = { x: anchor === "end" ? x - w : x, y: y - 7, w, h: 8 };
      if (placer.overlaps(box)) return "";
      return text(x, y, label, `class="micro halo"${anchor === "end" ? ` text-anchor="end"` : ""}`);
    };
    if (horizontal) {
      if (p.y < clamp.y0 + 8 || p.y > clamp.y1 - 8) return "";
      line += `<path d="M${clamp.x0} ${num(p.y)}H${clamp.x1}"/>`;
      for (let x = clamp.x0 + 10; x < clamp.x1; x += projection.distance(FEET_PER_MINUTE * 0.1)) line += `<path d="M${num(x)} ${num(p.y - 2.6)}V${num(p.y + 2.6)}"/>`;
      line += tryLabel(clamp.x1 - 3, p.y - 3, "end");
      line += tryLabel(clamp.x0 + 3, p.y - 3, "start");
    } else {
      if (p.x < clamp.x0 + 8 || p.x > clamp.x1 - 8) return "";
      line += `<path d="M${num(p.x)} ${clamp.y0}V${clamp.y1}"/>`;
      for (let y = clamp.y0 + 10; y < clamp.y1; y += projection.distance(FEET_PER_MINUTE * 0.1)) line += `<path d="M${num(p.x - 2.6)} ${num(y)}H${num(p.x + 2.6)}"/>`;
      line += tryLabel(p.x + 4, clamp.y1 - 5, "start");
      line += tryLabel(p.x + 4, clamp.y0 + 10, "start");
    }
    return line;
  };

  for (let k = -6; k <= 6; k++) {
    out += drawLine(true, (Math.round((lat * 60) / step) + k) * step);
    out += drawLine(false, (Math.round((lon * 60) / step) + k) * step);
  }
  return `${out}</g>`;
}

/** Pavement pass (spec A3/B4, punch P2): aprons + taxiway ribbons as one flat gray
 * layer, fillet patches at junctions, flared throats where connectors meet runways. */
function pavement(model: SiteModel, projection: Projection): string {
  const runwayById = new Map(model.runways.map((r) => [r.id, r]));
  let out = `<g id="pavement" fill="${GRAY}" stroke="none">`;
  for (const apron of model.aprons) {
    if (apron.polygon.length < 3) continue;
    out += `<polygon points="${projection.polygon(apron.polygon)}"/>`;
  }
  out += `</g><g id="taxiway-ribbons" stroke="${GRAY}" fill="none">`;
  for (const taxiway of model.taxiways) {
    const width = Math.max(2.2, projection.distance(taxiway.width));
    const path = taxiway.kind === "exit" && taxiway.points.length === 3
      ? (() => { const [a, c, b] = taxiway.points.map((p) => projection.point(p)); return `M${num(a!.x)} ${num(a!.y)}Q${num(c!.x)} ${num(c!.y)} ${num(b!.x)} ${num(b!.y)}`; })()
      : projection.path(taxiway.points);
    out += `<path d="${path}" stroke-width="${num(width)}" stroke-linecap="butt" stroke-linejoin="round"/>`;
  }
  out += `</g><g id="pavement-fillets" fill="${GRAY}" stroke="none">`;
  // Fillet and flare sizes scale with the taxiway design group (spec A2): heavier
  // TDG fields have visibly larger junction pavement.
  const tdgScale = { "2A": 0.85, "3": 1, "4": 1.15, "5": 1.3 }[model.design.tdg];
  for (const taxiway of model.taxiways) {
    const radius = Math.max(1.4, projection.distance(taxiway.width) * 0.62 * tdgScale);
    // Fillet patches at interior bends and at junction endpoints.
    for (const p of taxiway.points.slice(1)) {
      const q = projection.point(p);
      out += `<circle cx="${num(q.x)}" cy="${num(q.y)}" r="${num(radius)}"/>`;
    }
    // Flared throat where a connector meets its runway (first point sits on the CL).
    if ((taxiway.kind === "connector" || taxiway.kind === "exit") && taxiway.runwayId) {
      const runway = runwayById.get(taxiway.runwayId);
      if (!runway) continue;
      const start = taxiway.points[0]!;
      const next = taxiway.points[1]!;
      const dir = sub(next, start);
      const len = Math.hypot(dir.x, dir.y) || 1;
      const unit = { x: dir.x / len, y: dir.y / len };
      const side = perp(unit);
      const edge = add(start, vscale(unit, runway.width / 2));
      const throatLength = Math.min(220 * tdgScale, len * 0.5);
      const tip = add(edge, vscale(unit, throatLength));
      const flare: Polygon = [
        add(edge, vscale(side, taxiway.width * 1.7 * tdgScale)),
        add(edge, vscale(side, -taxiway.width * 1.7 * tdgScale)),
        add(tip, vscale(side, -taxiway.width * 0.52)),
        add(tip, vscale(side, taxiway.width * 0.52)),
      ];
      out += `<polygon points="${projection.polygon(flare)}"/>`;
    }
  }
  return `${out}</g>`;
}

/** Fold a page rotation into ±90° so text never reads upside-down (harvest H7). */
function fold(angle: number): number {
  let a = ((angle % 360) + 360) % 360;
  if (a > 90 && a < 270) a -= 180;
  return ((a + 180) % 360) - 180;
}

interface FontScale { end: number; heading: number; dims: number; elev: number; twy: number; minor: number; blast: number; }

function runwayLayer(model: SiteModel, projection: Projection, placer: LabelPlacer, fonts: FontScale): string {
  // Non-active pavement (screened, outlined, dotted) draws beneath active bars so
  // removed/future pavement passes under an active runway at crossings.
  const under: string[] = [];
  const over: string[] = [];
  model.runways.forEach((runway, index) => {
    (runway.lifecycle === "active" ? over : under).push(runwayShape(runway, index, projection, placer, fonts));
  });
  return `<g id="runways">${under.join("")}${over.join("")}</g>`;
}

function runwayShape(runway: Runway, index: number, projection: Projection, placer: LabelPlacer, fonts: FontScale): string {
  const body = rect(runway.center, runway.width, runway.length, -runway.heading);
  const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
  const pa = projection.point(a);
  const pb = projection.point(b);
  const axis = polar(runway.heading);
  const dirAB = projection.direction(axis);
  const pageAngle = (Math.atan2(dirAB.y, dirAB.x) * 180) / Math.PI;
  const foldedAngle = fold(pageAngle);
  const sidePage = { x: -dirAB.y, y: dirAB.x };
  const halfWidthPage = projection.distance(runway.width) / 2;
  let out = `<g id="runway-${esc(runway.id)}">`;

  if (runway.lifecycle !== "active") {
    // Lifecycle portrayal matrix (IAC 9 §3.5.2.2–3.5.2.4). Each state selects its
    // geometry and which runway data survives on the sheet.
    const xAt = (t: number): string => {
      const c = projection.point(pointAlong(a, b, t));
      const r = Math.max(4, halfWidthPage * 1.3);
      const u = { x: dirAB.x * r, y: dirAB.y * r };
      const v = { x: sidePage.x * r, y: sidePage.y * r };
      return `<path d="M${num(c.x - u.x - v.x)} ${num(c.y - u.y - v.y)}L${num(c.x + u.x + v.x)} ${num(c.y + u.y + v.y)}M${num(c.x - u.x + v.x)} ${num(c.y - u.y + v.y)}L${num(c.x + u.x - v.x)} ${num(c.y + u.y - v.y)}" class="thin"/>`;
    };
    const lengthPage = Math.max(1, projection.distance(runway.length));
    const tEnd = Math.min(0.12, (Math.max(4, halfWidthPage * 1.3) * 1.6) / lengthPage);

    if (runway.lifecycle === "repurposed") {
      // Re-purposed as taxiway/apron: screened pavement identified by its new use.
      out += `<polygon points="${projection.polygon(body)}" fill="${GRAY}" stroke="none"/>`;
      return `${out}</g>`;
    }
    if (runway.lifecycle === "removed") {
      // Out of the runway database: screened pavement + repeated X's, no data.
      out += `<polygon points="${projection.polygon(body)}" fill="${GRAY}" stroke="none"/>`;
      const count = Math.max(2, Math.floor(lengthPage / 70));
      for (let i = 0; i < count; i++) out += xAt((i + 0.5) / count);
      return `${out}</g>`;
    }
    if (runway.lifecycle === "new-construction") {
      // New runway under construction: dotted outline only.
      out += `<polygon points="${projection.polygon(body)}" fill="none" class="dotted"/>`;
      return `${out}</g>`;
    }
    // Outlined states: closed-permanent / closed-indefinite / under-construction.
    out += `<polygon points="${projection.polygon(body)}" fill="${WHITE}" class="thin"/>`;
    if (runway.lifecycle !== "under-construction") {
      out += xAt(tEnd);
      out += xAt(1 - tEnd);
    }
    if (runway.lifecycle === "closed-permanent") return `${out}</g>`;

    // Retained data: end designators and a center state label.
    runway.ends.forEach((end, endIndex) => {
      if (!end.designator) return;
      const endpoint = endIndex === 0 ? pa : pb;
      const inward = endIndex === 0 ? dirAB : { x: -dirAB.x, y: -dirAB.y };
      const rotation = (Math.atan2(inward.x, -inward.y) * 180) / Math.PI;
      const candidates = [13, 26, 40, 58, 80].map((extra) => ({ x: endpoint.x - inward.x * extra, y: endpoint.y - inward.y * extra }));
      const size = fonts.end - 2;
      const p = candidates.find((candidate) => placer.claim(candidate, end.designator, size, rotation))
        ?? placer.forceBest({ x: 0, y: 0 }, end.designator, size, candidates, rotation);
      out += text(p.x, p.y + size * 0.36, end.designator, `class="runway-end halo" text-anchor="middle" transform="rotate(${num(rotation)} ${num(p.x)} ${num(p.y)})" font-size="${num(size)}"`);
    });
    const stateLabel = runway.lifecycle === "under-construction" ? "UNDER CONSTRUCTION" : "CLOSED";
    const mid = projection.point(pointAlong(a, b, 0.5));
    const stateCandidates = [0, 10, -10, 18, -18].map((d) => ({ x: mid.x + sidePage.x * d, y: mid.y + sidePage.y * d }));
    const placedState = placer.try(mid, stateLabel, fonts.minor, stateCandidates.map((c) => ({ x: c.x - mid.x, y: c.y - mid.y })), foldedAngle);
    const statePoint = placedState?.point ?? placer.forceBest(mid, stateLabel, fonts.minor, stateCandidates.map((c) => ({ x: c.x - mid.x, y: c.y - mid.y })), foldedAngle);
    out += text(statePoint.x, statePoint.y, stateLabel, `class="minor halo" text-anchor="middle" transform="rotate(${num(foldedAngle)} ${num(statePoint.x)} ${num(statePoint.y)})" font-size="${fonts.minor}"`);
    return `${out}</g>`;
  }

  // Every open runway is a solid black bar (spec B4, punch P1).
  out += `<polygon points="${projection.polygon(body)}" fill="${BLACK}" stroke="none"/>`;

  // Blast pads (chevronned gray) and EMAS (outlined bed) beyond each end.
  runway.ends.forEach((end, endIndex) => {
    const endpoint = endIndex === 0 ? a : b;
    const outward = polar(runway.heading + (endIndex === 0 ? 180 : 0));
    if (end.blastPad > 0) {
      const pad = rect(add(endpoint, vscale(outward, end.blastPad / 2)), runway.width + 30, end.blastPad, -runway.heading);
      out += `<polygon points="${projection.polygon(pad)}" fill="${GRAY}" stroke="none"/>`;
      const chevrons = Math.max(2, Math.floor(end.blastPad / 220));
      const dOut = projection.direction(outward);
      for (let k = 0; k < chevrons; k++) {
        const c = projection.point(add(endpoint, vscale(outward, ((k + 0.5) / chevrons) * end.blastPad)));
        const w = halfWidthPage * 0.9;
        out += `<path d="M${num(c.x - sidePage.x * w - dOut.x * 3)} ${num(c.y - sidePage.y * w - dOut.y * 3)}L${num(c.x)} ${num(c.y)}L${num(c.x + sidePage.x * w - dOut.x * 3)} ${num(c.y + sidePage.y * w - dOut.y * 3)}" class="thin" fill="none"/>`;
      }
    }
    if (end.emas > 0) {
      const bed = rect(add(endpoint, vscale(outward, 40 + end.emas / 2)), runway.width + 20, end.emas, -runway.heading);
      out += `<polygon points="${projection.polygon(bed)}" fill="${WHITE}" class="thin"/>`;
      const labelPoint = projection.point(add(endpoint, vscale(outward, end.emas + 180)));
      const candidates = [0.8, 1.5, 2.3].flatMap((factor) => RING.map((candidate) => ({ x: candidate.x * factor, y: candidate.y * factor })));
      const anchor = placer.try(labelPoint, "EMAS", fonts.blast, candidates)?.point ?? placer.forceBest(labelPoint, "EMAS", fonts.blast, candidates);
      out += text(anchor.x, anchor.y, "EMAS", `class="blast halo" text-anchor="middle"`);
    }
  });

  // Displaced thresholds per Appendix 1: centerline arrows from the beginning of
  // pavement leading to a solid transverse bar at the displaced threshold.
  runway.ends.forEach((end, endIndex) => {
    if (end.displaced <= 0) return;
    const endpoint = endIndex === 0 ? a : b;
    const opposite = endIndex === 0 ? b : a;
    const inward = { x: (opposite.x - endpoint.x) / runway.length, y: (opposite.y - endpoint.y) / runway.length };
    const dIn = projection.direction(inward);
    const sIn = { x: -dIn.y, y: dIn.x };
    const threshold = projection.point(add(endpoint, vscale(inward, end.displaced)));
    const w = halfWidthPage * 0.82;
    out += `<path d="M${num(threshold.x - sIn.x * w)} ${num(threshold.y - sIn.y * w)}L${num(threshold.x + sIn.x * w)} ${num(threshold.y + sIn.y * w)}" stroke="${WHITE}" stroke-width="1.3"/>`;
    const arrows = Math.max(1, Math.floor(end.displaced / 300));
    for (let k = 0; k < arrows; k++) {
      const tail = projection.point(add(endpoint, vscale(inward, (k / arrows) * end.displaced + end.displaced * 0.08 / arrows)));
      const head = projection.point(add(endpoint, vscale(inward, ((k + 0.86) / arrows) * end.displaced)));
      out += `<path d="M${num(tail.x)} ${num(tail.y)}L${num(head.x)} ${num(head.y)}M${num(head.x - dIn.x * 2.4 + sIn.x * 1.8)} ${num(head.y - dIn.y * 2.4 + sIn.y * 1.8)}L${num(head.x)} ${num(head.y)}L${num(head.x - dIn.x * 2.4 - sIn.x * 1.8)} ${num(head.y - dIn.y * 2.4 - sIn.y * 1.8)}" fill="none" stroke="${WHITE}" stroke-width=".7"/>`;
    }
  });

  // Approach-light miniatures + circled system letter, and VGSI dots on the
  // recorded side (Appendix 2 families, Phase 4).
  runway.ends.forEach((end, endIndex) => {
    const endpoint = endIndex === 0 ? a : b;
    const opposite = endIndex === 0 ? b : a;
    const inward = { x: (opposite.x - endpoint.x) / runway.length, y: (opposite.y - endpoint.y) / runway.length };
    const dIn = projection.direction(inward);
    const dOut = { x: -dIn.x, y: -dIn.y };
    if (end.approachLights) {
      const len = Math.max(10, Math.min(22, projection.distance(2400)));
      const base = projection.point(endpoint);
      const tip = { x: base.x + dOut.x * len, y: base.y + dOut.y * len };
      const sIn = { x: -dIn.y, y: dIn.x };
      out += `<path d="M${num(base.x)} ${num(base.y)}L${num(tip.x)} ${num(tip.y)}" class="thin"/>`;
      for (let k = 1; k <= 4; k++) {
        const c = { x: base.x + dOut.x * (len * k) / 5, y: base.y + dOut.y * (len * k) / 5 };
        const w = 2.4 - k * 0.3;
        out += `<path d="M${num(c.x - sIn.x * w)} ${num(c.y - sIn.y * w)}L${num(c.x + sIn.x * w)} ${num(c.y + sIn.y * w)}" class="thin"/>`;
      }
      const letter = { "ALSF-2": "A", SSALR: "S", MALSR: "M", ODALS: "O" }[end.approachLights];
      const cx = tip.x + dOut.x * 4.6;
      const cy = tip.y + dOut.y * 4.6;
      out += `<circle cx="${num(cx)}" cy="${num(cy)}" r="3.4" fill="${WHITE}" class="thin"/>`;
      out += text(cx, cy + 2, letter!, `class="blast" text-anchor="middle" font-size="5.4"`);
      placer.reserve({ x: Math.min(base.x, cx) - 4, y: Math.min(base.y, cy) - 4, w: Math.abs(cx - base.x) + 8, h: Math.abs(cy - base.y) + 8 });
    }
    if (end.vgsi) {
      // Side is as seen on final approach: left of the inward direction.
      const left = { x: dIn.y, y: -dIn.x };
      const sideDir = end.vgsi.side === "L" ? left : { x: -left.x, y: -left.y };
      const station = projection.point(add(endpoint, vscale(inward, 1000)));
      const offset = halfWidthPage + 3.4;
      const count = end.vgsi.kind === "PAPI" ? 4 : 2;
      for (let k = 0; k < count; k++) {
        const c = { x: station.x + sideDir.x * (offset + k * 2) + dIn.x * 0, y: station.y + sideDir.y * (offset + k * 2) };
        out += `<circle cx="${num(c.x)}" cy="${num(c.y)}" r=".8" fill="${BLACK}"/>`;
      }
    }
  });

  // Centerline lights: a fine white dotted line inside the bar (never instead of it).
  if (runway.centerlineLights) {
    const inset = projection.distance(runway.length) * 0.03;
    const ia = { x: pa.x + dirAB.x * inset, y: pa.y + dirAB.y * inset };
    const ib = { x: pb.x - dirAB.x * inset, y: pb.y - dirAB.y * inset };
    out += `<path d="M${num(ia.x)} ${num(ia.y)}L${num(ib.x)} ${num(ib.y)}" class="centerlights"/>`;
  }

  // --- Annotation stations (harvest H7, punch P5) ---
  const along = (t: number): Point => {
    const p = pointAlong(a, b, t);
    return projection.point(p);
  };
  const dimSide = index % 2 === 0 ? 1 : -1;
  const offset = (p: Point, side: number, distance: number): Point => ({ x: p.x + sidePage.x * side * (halfWidthPage + distance), y: p.y + sidePage.y * side * (halfWidthPage + distance) });
  type LinearPlacement = { point: Point; t: number; side: number; distance: number };
  const placeLinear = (label: string, size: number, preferredT: number, preferredSide: number, distance: number): LinearPlacement => {
    // Operational labels stay on their prescribed runway side and offset. Only the
    // along-runway station may slide to clear another higher-priority runway label.
    const stationDeltas = [0, ...Array.from({ length: 19 }, (_, index) => 0.05 + index * 0.05 - preferredT)]
      .sort((one, two) => Math.abs(one) - Math.abs(two));
    const candidates: LinearPlacement[] = [];
    for (const extra of [0, 5, 10, 15, 20]) for (const delta of stationDeltas) {
      const t = Math.max(0.035, Math.min(0.965, preferredT + delta));
      candidates.push({ point: offset(along(t), preferredSide, distance + extra), t, side: preferredSide, distance: distance + extra });
    }
    for (const candidate of candidates) if (placer.claim(candidate.point, label, size, foldedAngle)) return candidate;
    const point = placer.forceBest({ x: 0, y: 0 }, label, size, candidates.map((candidate) => candidate.point), foldedAngle);
    return candidates.find((candidate) => candidate.point.x === point.x && candidate.point.y === point.y) ?? { ...candidates[0]!, point };
  };

  // End numbers: outside the threshold clearing blast pad / EMAS, rotated to read
  // from final approach (deliberately not folded).
  runway.ends.forEach((end, endIndex) => {
    if (!end.designator) return;
    const endpoint = endIndex === 0 ? pa : pb;
    const inward = endIndex === 0 ? dirAB : { x: -dirAB.x, y: -dirAB.y };
    const clear = projection.distance(Math.max(end.blastPad, end.emas)) + 13;
    const rotation = (Math.atan2(inward.x, -inward.y) * 180) / Math.PI;
    const candidates = [0, 12, 24, 38, 54, 72, 96, 124, 156, 192].map((extra) => ({
      x: endpoint.x - inward.x * (clear + extra),
      y: endpoint.y - inward.y * (clear + extra),
    }));
    let endSize = fonts.end;
    let p: Point | undefined;
    for (const size of [fonts.end, fonts.end - 1, fonts.end - 2]) {
      p = candidates.find((candidate) => placer.claim(candidate, end.designator, size, rotation));
      if (p) { endSize = size; break; }
    }
    if (!p) endSize = fonts.end - 2;
    p ??= placer.forceBest({ x: 0, y: 0 }, end.designator, endSize, candidates, rotation);
    out += text(p.x, p.y + endSize * 0.36, end.designator, `class="runway-end halo" text-anchor="middle" transform="rotate(${num(rotation)} ${num(p.x)} ${num(p.y)})" font-size="${num(endSize)}"`);
  });

  // ELEV at 5.5% of length, opposite side from the heading label at 16%.
  runway.ends.forEach((end, endIndex) => {
    const tElev = endIndex === 0 ? 0.055 : 1 - 0.055;
    const tHeading = endIndex === 0 ? 0.16 : 1 - 0.16;
    const elevLabel = `ELEV ${end.elevation}`;
    const elevPoint = placeLinear(elevLabel, fonts.elev, tElev, -dimSide, 9).point;
    out += text(elevPoint.x, elevPoint.y, elevLabel, `class="elev halo" text-anchor="middle" transform="rotate(${num(foldedAngle)} ${num(elevPoint.x)} ${num(elevPoint.y)})" font-size="${fonts.elev}"`);

    const inward = endIndex === 0 ? dirAB : { x: -dirAB.x, y: -dirAB.y };
    const headingLabel = `${end.magneticHeading.toFixed(1).padStart(5, "0")}°`;
    const headingPlacement = placeLinear(headingLabel, fonts.heading, tHeading, dimSide, 10);
    const headingPoint = headingPlacement.point;
    out += text(headingPoint.x, headingPoint.y, headingLabel, `class="hdg halo" text-anchor="middle" transform="rotate(${num(foldedAngle)} ${num(headingPoint.x)} ${num(headingPoint.y)})" font-size="${fonts.heading}"`);
    // Along-runway arrow beside the heading value.
    const arrowBase = offset(along(headingPlacement.t + (endIndex === 0 ? 0.045 : -0.045)), headingPlacement.side, headingPlacement.distance);
    const tip = { x: arrowBase.x + inward.x * 9, y: arrowBase.y + inward.y * 9 };
    const sp = { x: -inward.y, y: inward.x };
    out += `<path d="M${num(arrowBase.x)} ${num(arrowBase.y)}L${num(tip.x)} ${num(tip.y)}M${num(tip.x - inward.x * 3 + sp.x * 2)} ${num(tip.y - inward.y * 3 + sp.y * 2)}L${num(tip.x)} ${num(tip.y)}L${num(tip.x - inward.x * 3 - sp.x * 2)} ${num(tip.y - inward.y * 3 - sp.y * 2)}" class="thin"/>`;
  });

  // One dimension label per runway at midfield, side alternating by index.
  const dimLabel = `${runway.length} X ${runway.width}`;
  const dimPoint = placeLinear(dimLabel, fonts.dims, 0.5, dimSide, 8).point;
  out += text(dimPoint.x, dimPoint.y, dimLabel, `class="dims halo" text-anchor="middle" transform="rotate(${num(foldedAngle)} ${num(dimPoint.x)} ${num(dimPoint.y)})" font-size="${fonts.dims}"`);
  if (runway.slope >= 0.3) {
    const upEnd = runway.ends[0].elevation > runway.ends[1].elevation ? 0 : 1;
    const slopeLabel = `${runway.slope.toFixed(1)}% UP`;
    const slopePlacement = placeLinear(slopeLabel, fonts.minor, 0.36, dimSide, 8);
    const slopePoint = slopePlacement.point;
    out += text(slopePoint.x, slopePoint.y, slopeLabel, `class="minor halo" text-anchor="middle" transform="rotate(${num(foldedAngle)} ${num(slopePoint.x)} ${num(slopePoint.y)})" font-size="${fonts.minor}"`);
    // Uphill arrow drawn as a path (font-independent).
    const uphill = upEnd === 0 ? { x: -dirAB.x, y: -dirAB.y } : dirAB;
    const base = offset(along(slopePlacement.t + (upEnd === 0 ? -0.035 : 0.035) * (slopeLabel.length / 8)), slopePlacement.side, slopePlacement.distance);
    const tip = { x: base.x + uphill.x * 8, y: base.y + uphill.y * 8 };
    const sp = { x: -uphill.y, y: uphill.x };
    out += `<path d="M${num(base.x)} ${num(base.y)}L${num(tip.x)} ${num(tip.y)}M${num(tip.x - uphill.x * 2.6 + sp.x * 1.8)} ${num(tip.y - uphill.y * 2.6 + sp.y * 1.8)}L${num(tip.x)} ${num(tip.y)}L${num(tip.x - uphill.x * 2.6 - sp.x * 1.8)} ${num(tip.y - uphill.y * 2.6 - sp.y * 1.8)}" class="thin"/>`;
  }
  return `${out}</g>`;
}

/** Taxiway letters: repeat along long parallels, set along the local path tangent
 * (IAC 9), folded to ±90° so they never read upside-down; checkerboard side
 * alternation with a drop-but-keep-≥1 policy (harvest H4/H7). */
function taxiwayLabels(model: SiteModel, projection: Projection, placer: LabelPlacer, fonts: FontScale): string {
  let out = `<g id="taxiway-labels">`;
  model.taxiways.forEach((taxiway, twyIndex) => {
    if (taxiway.unlabeled || !taxiway.name) return;
    const pathLength = taxiway.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - taxiway.points[i]!.x, p.y - taxiway.points[i]!.y), 0);
    const spacing = 2500;
    const count = taxiway.kind === "parallel" || taxiway.kind === "service" ? Math.max(1, Math.round(pathLength / spacing)) : 1;
    let placedAny = false;
    type Candidate = { point: Point; angle: number };
    const candidatesAt = (preferredT: number, preferredSide: number): Candidate[] => {
      const candidates: Candidate[] = [];
      const stations = [preferredT, ...Array.from({ length: 19 }, (_, index) => 0.05 + index * 0.05)]
        .map((station) => Math.max(0.04, Math.min(0.96, station)))
        .sort((one, two) => Math.abs(one - preferredT) - Math.abs(two - preferredT));
      for (const t of stations) {
        const before = projection.point(pointOnPolyline(taxiway.points, Math.max(0, t - 0.01)));
        const after = projection.point(pointOnPolyline(taxiway.points, Math.min(1, t + 0.01)));
        const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
        const normal = { x: -(after.y - before.y) / length, y: (after.x - before.x) / length };
        // The identifier sets along the local tangent at its own station.
        const angle = fold((Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI);
        const anchor = projection.point(pointOnPolyline(taxiway.points, t));
        for (const side of [preferredSide, -preferredSide]) for (const distance of [5.5, 9, 13, 18, 24, 30, 36, 42]) {
          candidates.push({ point: { x: anchor.x + normal.x * side * distance, y: anchor.y + normal.y * side * distance }, angle });
        }
      }
      return candidates;
    };
    const label = (candidate: Candidate, size: number): string =>
      text(candidate.point.x, candidate.point.y, taxiway.name,
        `class="twy halo" text-anchor="middle" transform="rotate(${num(candidate.angle)} ${num(candidate.point.x)} ${num(candidate.point.y)})" font-size="${num(size)}"`);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : (0.6 * spacing + i * ((pathLength - 1.2 * spacing) / Math.max(1, count - 1))) / pathLength;
      const side = (i + twyIndex) % 2 === 0 ? 1 : -1;
      const candidates = candidatesAt(Math.max(0.05, Math.min(0.95, t)), side);
      for (const size of [fonts.twy, fonts.twy - 0.7, fonts.twy - 1.2, Math.max(4.6, fonts.twy - 1.7)]) {
        const found = candidates.find((candidate) => placer.claim(candidate.point, taxiway.name, size, candidate.angle));
        if (found) {
          out += label(found, size);
          placedAny = true;
          break;
        }
      }
    }
    // Spine taxiways always keep at least one identifier; numbered connector
    // stubs may drop theirs on a congested sheet (their siblings remain).
    if (!placedAny && (taxiway.kind === "parallel" || taxiway.kind === "service")) {
      const candidates = candidatesAt(0.5, twyIndex % 2 === 0 ? 1 : -1);
      const fallbackSize = Math.max(4.6, fonts.twy - 1.7);
      const angle = candidates[0]?.angle ?? 0;
      const p = placer.forceBest({ x: 0, y: 0 }, taxiway.name, fallbackSize, candidates.map((c) => c.point), angle);
      out += label({ point: p, angle }, fallbackSize);
    }
  });
  return `${out}</g>`;
}

function pointOnPolyline(points: Point[], t: number): Point {
  const total = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);
  let target = total * t;
  for (let i = 0; i < points.length - 1; i++) {
    const seg = Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
    if (target <= seg) return pointAlong(points[i]!, points[i + 1]!, seg ? target / seg : 0);
    target -= seg;
  }
  return points[points.length - 1]!;
}

function areaCentroid(polygon: Polygon): Point {
  let area = 0; let cx = 0; let cy = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const cross = polygon[j]!.x * polygon[i]!.y - polygon[i]!.x * polygon[j]!.y;
    area += cross;
    cx += (polygon[j]!.x + polygon[i]!.x) * cross;
    cy += (polygon[j]!.y + polygon[i]!.y) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1) return polygon[0]!;
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

function star(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? r * 0.42 : r;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${num(cx + Math.cos(angle) * radius)},${num(cy + Math.sin(angle) * radius)}`);
  }
  return `<polygon points="${points.join(" ")}" fill="${WHITE}" stroke="${BLACK}" class="thin"/>`;
}

function towerElevation(model: SiteModel): number {
  let hash = 0;
  for (const ch of model.identity.icao) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return model.identity.elevation + 90 + (hash % 81);
}

/** Jet bridges: the short stubs from a terminal's gate face out to each parked
 * aircraft. Real charts draw them as fine black ticks along the gate frontage,
 * and they are much of what makes a terminal read as a terminal rather than as
 * a black blob. Drawn only where a bridge would really exist: regional stands
 * are commonly walk-out, and stands are skipped entirely when the page scale is
 * too small for the tick to be legible. */
function jetBridgesLayer(model: SiteModel, projection: Projection): string {
  const terminalStands = model.stands.filter((stand) => stand.ownerId.startsWith("comp-"));
  if (terminalStands.length === 0) return "";
  let out = `<g id="jet-bridges" stroke="${BLACK}" stroke-linecap="butt" fill="none" stroke-width="0.5">`;
  let drawn = 0;
  for (const stand of terminalStands) {
    if (stand.aircraftClass === "regional") continue;
    // The bridge spans from the building face to the aircraft nose: the stand
    // centre lies half a depth off the face, so the stub runs back along facing.
    const reach = stand.depth * 0.42;
    const root = { x: stand.center.x + stand.facing.x * reach, y: stand.center.y + stand.facing.y * reach };
    const a = projection.point(root);
    const b = projection.point(stand.center);
    // Below ~1.5pt the tick is indistinguishable from chart noise.
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1.5) continue;
    out += `<line x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}"/>`;
    drawn++;
  }
  out += `</g>`;
  return drawn > 0 ? out : "";
}

function buildingsLayer(model: SiteModel, projection: Projection, placer: LabelPlacer, fonts: FontScale): string {
  let out = `<g id="buildings" fill="${BLACK}" stroke="none">`;
  for (const building of model.buildings) {
    out += `<polygon points="${projection.polygon(building.polygon)}"/>`;
    // Buildings are obstacles for later labels.
    const box = bounds(building.polygon.map((p) => projection.point(p)));
    placer.reserve({ x: box.minX - 1, y: box.minY - 1, w: box.maxX - box.minX + 2, h: box.maxY - box.minY + 2 });
  }
  out += `</g>`;
  out += jetBridgesLayer(model, projection);
  out += `<g id="building-labels" class="thin">`;

  // Tower and beacon are independent facts: the star and the BCN line appear with
  // the tower only when the model records collocation.
  const beaconOnTower = model.beacon?.onTower ?? false;
  for (const building of model.buildings) {
    if (building.unlabeled) continue;
    const anchor = projection.point(areaCentroid(building.polygon));
    if (building.kind === "tower") {
      const label = `TWR ${towerElevation(model)}`;
      const candidates = RING.map((o) => ({ x: o.x * 1.4, y: o.y * 1.2 }));
      const placed = placer.try(anchor, label, fonts.minor, candidates) ?? { point: placer.forceBest(anchor, label, fonts.minor, candidates), leader: true };
      if (beaconOnTower) out += star(anchor.x, anchor.y - 7, 4.6);
      if (placed.leader) out += leaderPath(placer, anchor, { x: placed.point.x, y: placed.point.y + 2 });
      out += text(placed.point.x, placed.point.y, label, `class="minor halo" text-anchor="middle" font-size="${fonts.minor}"`);
      if (beaconOnTower) out += text(placed.point.x, placed.point.y + fonts.minor + 1, "BCN", `class="minor halo" text-anchor="middle" font-size="${fonts.minor}"`);
      continue;
    }
    // Terminal buildings are always identified (leader if needed); other
    // building labels drop entirely on collision (tiered policy).
    const ring = [1.6, 2.4, 3.4].flatMap((factor) => RING.map((o) => ({ x: o.x * factor, y: o.y * factor * 0.9 })));
    const placed = placer.try(anchor, building.label, fonts.minor, ring);
    if (!placed && building.kind !== "terminal") continue;
    const point = placed?.point ?? placer.forceBest(anchor, building.label, fonts.minor, ring);
    if (!placed || placed.leader) out += leaderPath(placer, anchor, { x: point.x, y: point.y + 2 });
    out += text(point.x, point.y, building.label, `class="minor halo" text-anchor="middle" font-size="${fonts.minor}"`);
  }

  // Standalone rotating beacon: star symbol + BCN label away from the tower.
  if (model.beacon && !model.beacon.onTower) {
    const p = projection.point(model.beacon.point);
    out += `<g id="beacon">`;
    out += star(p.x, p.y, 4.6);
    const placed = placer.try(p, "BCN", fonts.minor, RING.map((o) => ({ x: o.x * 1.2, y: o.y * 1.2 })));
    if (placed) out += text(placed.point.x, placed.point.y, "BCN", `class="minor halo" text-anchor="middle" font-size="${fonts.minor}"`);
    out += `</g>`;
  }

  // Apron labels never drop: widening rings of candidates, then force + leader.
  for (const apron of model.aprons) {
    if (!apron.label) continue;
    const anchor = projection.point(areaCentroid(apron.polygon));
    const candidates = [[2, 1.8], [2.9, 2.6], [3.9, 3.5]].flatMap(([fx, fy]) => RING.map((o) => ({ x: o.x * fx!, y: o.y * fy! })));
    const placed = placer.try(anchor, apron.label, fonts.minor, candidates);
    const point = placed?.point ?? placer.forceBest(anchor, apron.label, fonts.minor, candidates);
    if (placed?.leader || !placed) out += leaderPath(placer, anchor, { x: point.x, y: point.y + 2 });
    out += text(point.x, point.y, apron.label, `class="minor halo" text-anchor="middle" font-size="${fonts.minor}"`);
    if (apron.tieDowns) {
      const box = bounds(apron.polygon);
      for (let row = 0; row < 2; row++) for (let col = 0; col < 6; col++) {
        const mark = projection.point({ x: box.minX + ((col + 1) * (box.maxX - box.minX)) / 7, y: box.minY + ((row + 1) * (box.maxY - box.minY)) / 3 });
        out += `<path d="M${num(mark.x - 1.6)} ${num(mark.y)}h3.2M${num(mark.x)} ${num(mark.y - 1.6)}v3.2"/>`;
      }
    }
  }
  return `${out}</g>`;
}

/** Located features (Phase 4): wind cone / segmented circle, helipads, and
 * non-movement hatching along flagged apron edges. */
function featureLayer(model: SiteModel, projection: Projection, placer: LabelPlacer): string {
  let out = `<g id="located-features">`;

  if (model.windCone) {
    const p = projection.point(model.windCone.point);
    out += `<g id="wind-cone">`;
    out += `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="1.5" fill="${BLACK}"/>`;
    out += `<path d="M${num(p.x)} ${num(p.y)}v-6l4 1.6-4 1.6" fill="${BLACK}" class="thin"/>`;
    if (model.windCone.segmentedCircle) {
      out += `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="8" fill="none" stroke="${BLACK}" stroke-width=".7" stroke-dasharray="2.4 2"/>`;
    }
    placer.reserve({ x: p.x - 9, y: p.y - 9, w: 18, h: 18 });
    out += `</g>`;
  }

  for (const [i, pad] of model.helipads.entries()) {
    const p = projection.point(pad);
    out += `<g id="helipad-${i}"><circle cx="${num(p.x)}" cy="${num(p.y)}" r="4.6" fill="${WHITE}" class="thin"/>` +
      text(p.x, p.y + 2.4, "H", `class="small" text-anchor="middle" font-weight="700"`) + `</g>`;
    placer.reserve({ x: p.x - 6, y: p.y - 6, w: 12, h: 12 });
  }

  // Non-movement hatching: ticks along the flagged apron's building-side edge
  // (the edge farthest from every active runway).
  const activeSegs = model.runways.filter((r) => r.lifecycle === "active").map((r) => runwayEndpoints(r.center, r.heading, r.length));
  for (const apronId of model.nonMovementApronIds) {
    const apron = model.aprons.find((a) => a.id === apronId);
    if (!apron) continue;
    let best: { a: Point; b: Point; d: number } | null = null;
    for (let i = 0; i < apron.polygon.length; i++) {
      const a = apron.polygon[i]!;
      const b = apron.polygon[(i + 1) % apron.polygon.length]!;
      const mid = pointAlong(a, b, 0.5);
      const d = Math.min(...activeSegs.map(([ra, rb]) => Math.hypot(mid.x - (ra.x + rb.x) / 2, mid.y - (ra.y + rb.y) / 2)));
      if (!best || d > best.d) best = { a, b, d };
    }
    if (!best) continue;
    const pa = projection.point(best.a);
    const pb = projection.point(best.b);
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    const dir = { x: (pb.x - pa.x) / len, y: (pb.y - pa.y) / len };
    const normal = { x: -dir.y, y: dir.x };
    let hatch = `<g id="non-movement-${esc(apron.id)}" class="thin">`;
    hatch += `<path d="M${num(pa.x)} ${num(pa.y)}L${num(pb.x)} ${num(pb.y)}"/>`;
    const ticks = Math.max(3, Math.floor(len / 6));
    for (let k = 0; k <= ticks; k++) {
      const c = { x: pa.x + dir.x * (len * k) / ticks, y: pa.y + dir.y * (len * k) / ticks };
      hatch += `<path d="M${num(c.x)} ${num(c.y)}L${num(c.x + (dir.x + normal.x) * 2.2)} ${num(c.y + (dir.y + normal.y) * 2.2)}"/>`;
    }
    out += `${hatch}</g>`;
  }

  return `${out}</g>`;
}

function holdAndLahso(model: SiteModel, projection: Projection, placer: LabelPlacer, fonts: FontScale): string {
  let out = `<g id="hold-lines" class="thin">`;
  for (const hold of model.holdLines) {
    const center = projection.point(hold.point);
    const alongDir = projection.direction(perp(polar(hold.angle)));
    for (const o of [-1.4, 1.4]) {
      const ox = -alongDir.y * o; const oy = alongDir.x * o;
      out += `<path d="M${num(center.x - alongDir.x * 4.5 + ox)} ${num(center.y - alongDir.y * 4.5 + oy)}L${num(center.x + alongDir.x * 4.5 + ox)} ${num(center.y + alongDir.y * 4.5 + oy)}"/>`;
    }
    if (hold.kind === "ils" && model.role.includes("hub")) {
      const placed = placer.try(center, "ILS HOLD", fonts.minor, [{ x: 14, y: -9 }, { x: -14, y: 11 }, { x: 18, y: 11 }]);
      if (placed) out += text(placed.point.x, placed.point.y, "ILS HOLD", `class="minor halo" text-anchor="middle" font-size="${fonts.minor}"`);
    }
  }
  for (const [i, mark] of model.lahso.entries()) {
    const p = projection.point(mark.point);
    const d = projection.direction(polar(mark.angle));
    const s = { x: -d.y, y: d.x };
    // Paired loop symbol across the runway + LAHSO label with arrow.
    for (const o of [-2.4, 2.4]) {
      const c = { x: p.x + s.x * o, y: p.y + s.y * o };
      out += `<path d="M${num(c.x - d.x * 4)} ${num(c.y - d.y * 4)}a3.4 3.4 0 1 0 ${num(d.x * 0.02)} ${num(d.y * 0.02)}z" fill="none"/>`;
    }
    const side = i % 2 === 0 ? 1 : -1;
    const anchor = { x: p.x + s.x * side * 16, y: p.y + s.y * side * 16 };
    const placed = placer.try(anchor, "LAHSO", fonts.minor, [{ x: 0, y: 0 }, { x: 12, y: -10 }, { x: -12, y: 12 }]);
    if (placed) {
      out += text(placed.point.x, placed.point.y, "LAHSO", `class="minor halo" text-anchor="middle" font-size="${fonts.minor}"`);
      out += leaderPath(placer, { x: p.x + s.x * side * 5, y: p.y + s.y * side * 5 }, { x: placed.point.x - s.x * side * 6, y: placed.point.y + 3 });
    }
  }
  return `${out}</g>`;
}

function hotspotLayer(model: SiteModel, projection: Projection, placer: LabelPlacer): string {
  let out = `<g id="hotspots" fill="none" stroke="${BROWN}" class="hotspot">`;
  for (const [index, hotspot] of model.hotspots.entries()) {
    const p = projection.point(hotspot.point);
    // HS ellipses are chart symbols, not ground footprints: cap the page size
    // so compact GA sheets don't inflate them into monster ovals.
    const rx = Math.min(16, Math.max(7, projection.distance(hotspot.rx)));
    const ry = Math.min(12, Math.max(5.4, rx * 0.78 * (hotspot.ry / hotspot.rx / 0.78)));
    const pageAngle = fold((Math.atan2(projection.direction(polar(hotspot.angle)).y, projection.direction(polar(hotspot.angle)).x) * 180) / Math.PI);
    out += `<ellipse cx="${num(p.x)}" cy="${num(p.y)}" rx="${num(rx)}" ry="${num(ry)}" transform="rotate(${num(pageAngle)} ${num(p.x)} ${num(p.y)})"/>`;
    // Boxed label up-and-right, vertical side alternating by index.
    const vertical = index % 2 === 0 ? -1 : 1;
    const label = `HS ${hotspot.id}`;
    const candidates = [
      { x: rx + 20, y: vertical * (ry + 16) }, { x: -(rx + 24), y: vertical * (ry + 16) },
      { x: rx + 26, y: -vertical * (ry + 18) }, { x: 0, y: vertical * (ry + 26) },
      ...[1, 1.45, 1.9].flatMap((factor) => RING.slice(1).map((offset) => ({
        x: offset.x * factor + Math.sign(offset.x) * rx,
        y: offset.y * factor + Math.sign(offset.y) * ry,
      }))),
    ];
    const placed = placer.try(p, label, 8, candidates) ?? { point: placer.forceBest(p, label, 8, candidates), leader: true };
    const lp = placed.point;
    const toward = { x: p.x - lp.x, y: p.y - lp.y };
    const len = Math.hypot(toward.x, toward.y) || 1;
    const edge = { x: p.x - (toward.x / len) * rx * 0.72, y: p.y - (toward.y / len) * ry * 0.72 };
    out += leaderPath(placer, edge, { x: lp.x, y: lp.y + 3 });
    out += `<rect x="${num(lp.x - 13)}" y="${num(lp.y - 8)}" width="26" height="12" fill="${WHITE}"/>`;
    out += text(lp.x, lp.y + 1.5, label, `class="hot-text" text-anchor="middle" fill="${BROWN}" stroke="none"`);
  }
  return `${out}</g>`;
}

const textWidth = (value: string, size: number): number => Math.max(14, value.length * size * 0.6);

function airfieldObstacles(model: SiteModel, projection: Projection): Box[] {
  const obstacles: Box[] = [];
  for (const runway of model.runways) {
    const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
    obstacles.push(...sampledPathBoxes([a, b], projection, Math.max(13, projection.distance(runway.width) / 2 + 12)));
  }
  for (const taxiway of model.taxiways) obstacles.push(...sampledPathBoxes(taxiway.points, projection, Math.max(6, projection.distance(taxiway.width) / 2 + 5)));
  for (const apron of model.aprons) obstacles.push(pageBounds(apron.polygon, projection, 10));
  for (const building of model.buildings) obstacles.push(pageBounds(building.polygon, projection, 10));
  for (const hotspot of model.hotspots) {
    const point = projection.point(hotspot.point);
    const rx = Math.max(7, projection.distance(hotspot.rx)) + 30;
    const ry = Math.max(5.4, projection.distance(hotspot.ry)) + 24;
    obstacles.push({ x: point.x - rx, y: point.y - ry, w: rx * 2, h: ry * 2 });
  }
  return obstacles;
}

function furniturePlan(model: SiteModel, projection: Projection): FurniturePlan {
  const packer = new WhitespacePacker(airfieldObstacles(model, projection));
  const commLines = model.frequencies.flatMap((frequency) => [
    `${frequency.label}${frequency.partTime ? " ★" : ""}`,
    `${frequency.value}${frequency.detail ? ` ${frequency.detail}` : ""}`,
  ]);
  const commW = Math.max(128, ...commLines.map((line) => textWidth(line, 8))) + 12;
  // The boxed negative-D indicator hangs under the comm block when declared
  // distances are published.
  const commH = Math.max(34, model.frequencies.length * 21 + 8) + (model.declaredDistances ? 18 : 0);
  const comm = packer.place(commW, commH, ["top-left", "top-right", "center-left", "center-right"]);

  const cautionW = Math.min(430, Math.max(280, ...model.cautions.map((line) => textWidth(line, 8) + 14)));
  const cautionH = Math.max(28, model.cautions.length * 12 + 8);
  const caution = packer.place(cautionW, cautionH, ["bottom-center", "top-center", "bottom-left", "bottom-right"]);

  const magVar = packer.place(180, 126, ["bottom-right", "bottom-left", "center-right", "center-left"]);

  const pcnLines = model.runways.filter((runway) => runway.lifecycle === "active" && runway.pcn).map((runway) => `RWY ${runway.id}  ${runway.pcn}`);
  const pcnW = Math.max(170, ...pcnLines.map((line) => textWidth(line, 7) + 10));
  const pcnH = Math.max(20, pcnLines.length * 10 + 8);
  const pcn = packer.place(pcnW, pcnH, ["bottom-left", "bottom-right", "center-left", "center-right", "top-left"]);

  const notes = model.notes.length > 0
    ? packer.place(Math.max(120, ...model.notes.map((note) => textWidth(note, 7) + 10)), model.notes.length * 11 + 8, ["center-left", "center-right", "bottom-left", "top-left", "bottom-right"])
    : undefined;

  const ramp = model.rampFrequencies.length > 0
    ? packer.place(148, model.rampFrequencies.length * 10 + 22, ["bottom-right", "center-right", "bottom-left", "top-right"])
    : undefined;

  const lighting = model.lightingNotes.length > 0
    ? packer.place(Math.max(96, ...model.lightingNotes.map((line) => textWidth(line, 7) + 16)), model.lightingNotes.length * 10 + 12, ["center-right", "center-left", "bottom-right", "top-right", "bottom-left"])
    : undefined;

  const hotspotTable = model.hotspotTable && model.hotspots.length > 0
    ? packer.place(Math.max(120, ...model.hotspots.map((h) => textWidth(`HS ${h.id}  ${h.reason}`, 7) + 14)), model.hotspots.length * 10 + 24, ["bottom-left", "bottom-right", "center-left", "center-right"])
    : undefined;

  const legend = model.nonMovementApronIds.length > 0
    ? packer.place(132, 24, ["bottom-right", "bottom-left", "top-right", "center-right"])
    : undefined;

  const fieldLabel = `FIELD ELEV ${model.identity.elevation}`;
  const fieldW = textWidth(fieldLabel, 8) + 14;
  const commOnLeft = comm.x + comm.w / 2 < W / 2;
  const fieldElev = packer.place(fieldW, 25, commOnLeft
    ? ["top-right", "bottom-right", "center-right", "bottom-left"]
    : ["top-left", "bottom-left", "center-left", "bottom-right"]);

  return { comm, fieldElev, magVar, caution, pcn, notes, ramp, lighting, hotspotTable, legend, forced: packer.forced };
}

function commBlock(model: SiteModel, placement: Placement): string {
  const rightAligned = placement.x + placement.w / 2 > W / 2;
  const x = rightAligned ? placement.x + placement.w - 6 : placement.x + 6;
  let out = `<g id="comm-block" data-layout-slot="${placement.slot}">`;
  let y = placement.y + 12;
  for (const freq of model.frequencies) {
    out += text(x, y, `${freq.label}${freq.partTime ? " ★" : ""}`, `class="small halo"${rightAligned ? ` text-anchor="end"` : ""}`);
    y += 10;
    out += text(x, y, `${freq.value}${freq.detail ? ` ${freq.detail}` : ""}`, `class="small halo"${rightAligned ? ` text-anchor="end"` : ""}`);
    y += 11;
  }
  // Boxed negative-D: declared-distance information is available elsewhere.
  if (model.declaredDistances) {
    const dx = rightAligned ? placement.x + placement.w - 17 : placement.x + 6;
    out += `<g id="declared-distances"><rect x="${num(dx)}" y="${num(y - 4)}" width="11" height="11" fill="${BLACK}"/>` +
      text(dx + 5.5, y + 4.5, "D", `class="small" text-anchor="middle" fill="${WHITE}" font-weight="700"`) + `</g>`;
  }
  return `${out}</g>`;
}

/** FIELD ELEV box with a dot + leader to the known runway high point (the primary
 * end whose elevation equals the field elevation). */
function fieldElevBox(model: SiteModel, placement: Placement, projection: Projection, placer: LabelPlacer): string {
  const label = `FIELD ELEV ${model.identity.elevation}`;
  let out = `<g id="field-elevation" data-layout-slot="${placement.slot}"><rect x="${num(placement.x)}" y="${num(placement.y)}" width="${num(placement.w)}" height="21" fill="${WHITE}" class="thin"/>` +
    text(placement.x + placement.w / 2, placement.y + 14, label, `class="small" text-anchor="middle"`);
  const primary = model.runways.find((r) => r.lifecycle === "active");
  if (primary) {
    const high = primary.ends[0].elevation >= primary.ends[1].elevation ? 0 : 1;
    const [a, b] = runwayEndpoints(primary.center, primary.heading, primary.length);
    const dot = projection.point(pointAlong(a, b, high === 0 ? 0.02 : 0.98));
    // Leader leaves the box edge nearest the dot.
    const fromX = dot.x < placement.x ? placement.x : dot.x > placement.x + placement.w ? placement.x + placement.w : placement.x + placement.w / 2;
    const fromY = fromX === placement.x || fromX === placement.x + placement.w
      ? placement.y + 10
      : dot.y < placement.y ? placement.y : placement.y + 21;
    // The leader draws beneath later labels and reserves nothing: it may cross the
    // airfield to reach the high point, exactly like the published charts.
    const points = placer.leaderPath({ x: fromX, y: fromY }, dot);
    out += `<path d="${points.map((point, index) => `${index ? "L" : "M"}${num(point.x)} ${num(point.y)}`).join("")}" class="thin"/>`;
    out += `<circle cx="${num(dot.x)}" cy="${num(dot.y)}" r="1.7" fill="${BLACK}" stroke="${WHITE}" stroke-width=".8"/>`;
  }
  return `${out}</g>`;
}

/** Mag-var assembly (harvest H7): filled true-north head, open-V magnetic head,
 * VAR label on the side away from the magnetic arm, epoch beneath. */
function magVar(model: SiteModel, projection: Projection, placement: Placement): string {
  const x = placement.x + placement.w / 2;
  const y = placement.y + 70;
  const variation = model.identity.variation;
  const sign = variation < 0 ? "W" : "E";
  const northPage = projection.direction({ x: 0, y: 1 });
  const magPage = projection.direction(polar(variation));
  const arm = 62;
  const trueTip = { x: x + northPage.x * arm, y: y + northPage.y * arm };
  const magTip = { x: x + magPage.x * arm * 0.94, y: y + magPage.y * arm * 0.94 };
  const tPerp = { x: -northPage.y, y: northPage.x };
  const mPerp = { x: -magPage.y, y: magPage.x };
  let out = `<g id="mag-var" class="thin" data-layout-slot="${placement.slot}">`;
  out += `<path d="M${num(x)} ${num(y)}L${num(trueTip.x)} ${num(trueTip.y)}"/>`;
  out += `<polygon points="${num(trueTip.x)},${num(trueTip.y)} ${num(trueTip.x - northPage.x * 7 + tPerp.x * 2.6)},${num(trueTip.y - northPage.y * 7 + tPerp.y * 2.6)} ${num(trueTip.x - northPage.x * 7 - tPerp.x * 2.6)},${num(trueTip.y - northPage.y * 7 - tPerp.y * 2.6)}" fill="${BLACK}" stroke="none"/>`;
  out += `<path d="M${num(x)} ${num(y)}L${num(magTip.x)} ${num(magTip.y)}"/>`;
  out += `<path d="M${num(magTip.x - magPage.x * 7 + mPerp.x * 3)} ${num(magTip.y - magPage.y * 7 + mPerp.y * 3)}L${num(magTip.x)} ${num(magTip.y)}L${num(magTip.x - magPage.x * 7 - mPerp.x * 3)} ${num(magTip.y - magPage.y * 7 - mPerp.y * 3)}" fill="none"/>`;
  // VAR label flipped to the side away from the magnetic arm.
  const away = variation < 0 ? 1 : -1;
  out += text(trueTip.x + tPerp.x * away * -10 + 6 * away, trueTip.y + 8, "N", `class="minor halo"`);
  out += text(x + away * 34, y + 26, `VAR ${Math.abs(variation).toFixed(1)}° ${sign}`, `class="minor halo" text-anchor="middle"`);
  out += text(x, y + 44, `JANUARY ${2016 + (Math.abs(Math.round(variation * 2)) % 10)}`, `class="minor halo" text-anchor="middle"`);
  out += text(x, y + 55, `ANNUAL RATE OF CHANGE 0.1° ${sign}`, `class="minor halo" text-anchor="middle"`);
  return `${out}</g>`;
}

function bottomBlocks(model: SiteModel, plan: FurniturePlan): string {
  let out = `<g id="bottom-blocks">`;
  // Each text/table block is independently packed into available whitespace.
  const pcnLines = model.runways.filter((r) => r.lifecycle === "active" && r.pcn).map((r) => `RWY ${r.id}  ${r.pcn}`);
  let y = plan.pcn.y + 10;
  out += `<g id="pcn-block" data-layout-slot="${plan.pcn.slot}">`;
  for (const line of pcnLines) { out += text(plan.pcn.x + 4, y, line, `class="minor halo"`); y += 10; }
  out += `</g>`;

  const cautionX = plan.caution.x + plan.caution.w / 2;
  const cautionY = plan.caution.y + 11;
  out += `<g id="caution-block" data-layout-slot="${plan.caution.slot}">`;
  model.cautions.forEach((line, i) => {
    const cls = i === 1 ? "small underline halo" : "small halo";
    out += text(cautionX, cautionY + i * 12, line, `class="${cls}" text-anchor="middle"`);
  });
  out += `</g>`;

  if (model.rampFrequencies.length > 0 && plan.ramp) {
    const rows = model.rampFrequencies;
    const boxH = plan.ramp.h;
    const boxW = plan.ramp.w;
    const bx = plan.ramp.x;
    const by = plan.ramp.y;
    out += `<g id="ramp-frequency-block" data-layout-slot="${plan.ramp.slot}"><rect x="${num(bx)}" y="${num(by)}" width="${boxW}" height="${num(boxH)}" fill="${WHITE}" class="thin"/>`;
    out += text(bx + 8, by + 13, "RAMP FREQUENCIES", `class="minor underline"`);
    rows.forEach(([name, freq], i) => {
      out += text(bx + 8, by + 26 + i * 10, name!, `class="minor"`);
      out += text(bx + boxW - 8, by + 26 + i * 10, freq!, `class="minor" text-anchor="end"`);
    });
    out += `</g>`;
  }

  if (plan.notes) {
    let noteY = plan.notes.y + 10;
    out += `<g id="notes-block" data-layout-slot="${plan.notes.slot}">`;
    for (const note of model.notes) {
      out += text(plan.notes.x + 4, noteY, note, `class="minor halo"`);
      noteY += 11;
    }
    out += `</g>`;
  }

  // Grouped runway-lighting notes in a boxed block ("HIRL ALL RWYS" grammar).
  if (plan.lighting && model.lightingNotes.length > 0) {
    const box = plan.lighting;
    out += `<g id="lighting-block" data-layout-slot="${box.slot}"><rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" fill="${WHITE}" class="thin"/>`;
    model.lightingNotes.forEach((line, i) => {
      out += text(box.x + box.w / 2, box.y + 10 + i * 10, line, `class="minor" text-anchor="middle"`);
    });
    out += `</g>`;
  }

  // Structured hot spot table surfacing the modeled reasons.
  if (plan.hotspotTable && model.hotspotTable && model.hotspots.length > 0) {
    const box = plan.hotspotTable;
    out += `<g id="hotspot-table" data-layout-slot="${box.slot}"><rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" fill="${WHITE}" class="thin"/>`;
    out += text(box.x + 8, box.y + 12, "HOT SPOTS", `class="minor underline"`);
    model.hotspots.forEach((hotspot, i) => {
      out += text(box.x + 8, box.y + 24 + i * 10, `HS ${hotspot.id}`, `class="minor" fill="${BROWN}"`);
      out += text(box.x + 34, box.y + 24 + i * 10, hotspot.reason, `class="minor"`);
    });
    out += `</g>`;
  }

  // Non-movement legend: a labeled sample of the hatching.
  if (plan.legend && model.nonMovementApronIds.length > 0) {
    const box = plan.legend;
    out += `<g id="non-movement-legend" data-layout-slot="${box.slot}"><rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" fill="${WHITE}" class="thin"/>`;
    out += `<path d="M${num(box.x + 8)} ${num(box.y + 15)}h20" class="thin"/>`;
    for (let k = 0; k < 5; k++) {
      out += `<path d="M${num(box.x + 9 + k * 4.4)} ${num(box.y + 15)}l2.4 -2.6" class="thin"/>`;
    }
    out += text(box.x + 34, box.y + 16, "NON-MOVEMENT AREA", `class="minor"`);
    out += `</g>`;
  }
  return `${out}</g>`;
}

/** Margin topology per IAC 9 (real-diagram-features §1): top-left Julian revision
 * date stacked above the large title, AL-nnn centered top-only, top-right name (ID)
 * over city/state; bottom-left repeats the title with the Julian date below;
 * bottom-right shows city/state above name (ID). */
function margins(model: SiteModel): string {
  const { identity: id } = model;
  const right = `${id.airportName} (${id.id})`;
  const city = `${id.city.toUpperCase()}, ${id.state}`;
  return `<g id="margins">` +
    text(40, 24, model.chartNumber, `class="micro"`) + text(40, 42, "AIRPORT DIAGRAM", `class="title"`) +
    text(W / 2, 37, model.alNumber, `class="margin" text-anchor="middle"`) +
    text(860, 28, right, `class="margin" text-anchor="end"`) + text(860, 42, city, `class="small" text-anchor="end"`) +
    text(40, 1163, "AIRPORT DIAGRAM", `class="title"`) + text(40, 1178, model.chartNumber, `class="micro"`) +
    text(860, 1163, city, `class="small" text-anchor="end"`) + text(860, 1178, right, `class="margin" text-anchor="end"`) +
    text(17, H / 2, model.cycle, `class="micro" text-anchor="middle" transform="rotate(-90 17 ${H / 2})"`) +
    text(883, H / 2, model.cycle, `class="micro" text-anchor="middle" transform="rotate(90 883 ${H / 2})"`) + `</g>`;
}

export function render(model: SiteModel): string {
  // Prefer a large planview, then back off only when the movable furniture cannot
  // find clean whitespace. Dense hubs therefore retain enough annotation room while
  // compact fields are no longer constrained by a global 12,500-foot scale.
  let projection = new Projection(model);
  let furniture = furniturePlan(model, projection);
  for (const fill of [0.68, 0.64, 0.6, 0.56]) {
    if (furniture.forced === 0) break;
    projection = new Projection(model, fill);
    furniture = furniturePlan(model, projection);
  }
  const placer = new LabelPlacer();
  const dense = projection.scaleValue < 0.026 || model.runways.length >= 5 || model.taxiways.length >= 36;
  const fonts: FontScale = dense
    ? { end: 9.5, heading: 6.5, dims: 7, elev: 6.5, twy: 6, minor: 6, blast: 6 }
    : { end: 10.5, heading: 7.5, dims: 8, elev: 7, twy: 7, minor: 7, blast: 6.5 };

  // Whitespace-packed furniture registers first for the feature-label placer.
  const furnitureBoxes = [furniture.comm, furniture.fieldElev, furniture.magVar, furniture.caution, furniture.pcn, furniture.notes, furniture.ramp, furniture.lighting, furniture.hotspotTable, furniture.legend].filter((box): box is Placement => Boolean(box));
  for (const box of furnitureBoxes) placer.reserve(inflate(box, 4));
  const comm = commBlock(model, furniture.comm);
  const fieldElev = fieldElevBox(model, furniture.fieldElev, projection, placer);
  const magvar = magVar(model, projection, furniture.magVar);
  const bottom = bottomBlocks(model, furniture);

  // Runway bars deposit obstacles along their centerlines.
  for (const runway of model.runways) {
    const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
    const steps = Math.max(2, Math.round(projection.distance(runway.length) / 26));
    const half = Math.max(2, projection.distance(runway.width) / 2) + 2;
    for (let i = 0; i <= steps; i++) {
      const p = projection.point(pointAlong(a, b, i / steps));
      placer.reserve({ x: p.x - half, y: p.y - half, w: half * 2, h: half * 2 });
    }
  }

  // Operational identifiers claim their feature-relative positions before any
  // movable facility labels. Later labels and leaders route around these boxes.
  const runwayInk = runwayLayer(model, projection, placer, fonts);
  const taxiwayInk = taxiwayLabels(model, projection, placer, fonts);
  const graticuleInk = graticule(model, projection, placer);
  const holdInk = holdAndLahso(model, projection, placer, fonts);
  const buildingInk = buildingsLayer(model, projection, placer, fonts);
  const featureInk = featureLayer(model, projection, placer);
  const hotspotInk = hotspotLayer(model, projection, placer);
  const metadata = { seed: model.seed, role: model.role, archetype: model.terminalArchetype, id: model.identity.id, icao: model.identity.icao };
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" role="img" aria-labelledby="chart-title chart-desc" data-map-scale="${num(projection.scaleValue)}" data-label-priority="runway,taxiway,facility,hotspot" data-label-overlaps="${placer.forcedOverlaps}" data-label-overlap-items="${esc(placer.forcedOverlapLabels.join(","))}">` +
    `<title id="chart-title">${esc(model.identity.airportName)} airport diagram</title><desc id="chart-desc">Procedurally generated fictional FAA-style airport diagram for ${esc(model.identity.city)}, ${esc(model.identity.state)}.</desc>` +
    `<metadata>${esc(JSON.stringify(metadata))}</metadata><defs><style>` +
    `text{font-family:Futura,"Avenir Next",Avenir,"Century Gothic",sans-serif;fill:${BLACK};font-weight:500;letter-spacing:.06em}` +
    `.title{font-size:17px}.margin{font-size:10px}.small{font-size:8px}.micro{font-size:6.5px}` +
    `.runway-end{font-weight:700}.hdg{font-size:7.5px}.dims{font-size:8px}.elev{font-size:7px}.twy{font-size:7px}.minor{font-size:7px}.blast{font-size:6.5px}` +
    `.hdg,.dims,.elev,.twy,.minor,.blast{letter-spacing:.04em}` +
    `.thin{stroke:${BLACK};stroke-width:.52;fill:none}.grat{stroke:${BLACK};stroke-width:.4;fill:none}.halo{paint-order:stroke;stroke:${WHITE};stroke-width:2.1px;stroke-linejoin:round}` +
    `.centerlights{fill:none;stroke:${WHITE};stroke-width:.85;stroke-dasharray:.9 3.6;stroke-linecap:butt}` +
    `.dotted{stroke:${BLACK};stroke-width:.52;stroke-dasharray:.6 2.2;stroke-linecap:round}` +
    `.hotspot{stroke-width:1.2}.hot-text{font-size:7px;letter-spacing:.03em}.underline{text-decoration:underline}` +
    `</style><clipPath id="plot-clip"><rect x="${FRAME.x + 1}" y="${FRAME.y + 1}" width="${FRAME.w - 2}" height="${FRAME.h - 2}"/></clipPath></defs>` +
    `<rect width="${W}" height="${H}" fill="${WHITE}"/>${margins(model)}<rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" fill="none" stroke="${BLACK}" stroke-width="1.04"/>` +
    `<g clip-path="url(#plot-clip)">${graticuleInk}${pavement(model, projection)}${runwayInk}${holdInk}${buildingInk}${featureInk}${taxiwayInk}${comm}${fieldElev}${magvar}${bottom}${hotspotInk}</g></svg>`;
}
