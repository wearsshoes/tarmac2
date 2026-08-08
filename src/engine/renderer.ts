import { add, bounds, perp, pointAlong, polar, rect, rotate, runwayEndpoints, scale as vscale, sub } from "./geometry";
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

  constructor(model: SiteModel) {
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
    // Responsive page scale: the field occupies ~55% of the plot, but never more
    // than the scale at which ~2 minutes of latitude fill the plot — GA fields
    // should look small on the sheet.
    const fitH = (PLOT.h * 0.55) / Math.max(1, box.maxY - box.minY);
    const fitW = (PLOT.w * 0.66) / Math.max(1, box.maxX - box.minX);
    const cap = PLOT.h / 12500;
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

/** Label placement: spatial first-fit with a tiered drop policy (harvest H7). */
class LabelPlacer {
  boxes: Box[] = [];
  reserve(box: Box): void { this.boxes.push(box); }
  overlaps(a: Box): boolean { return this.boxes.some((b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y); }
  inFrame(box: Box): boolean { return box.x > FRAME.x + 2 && box.x + box.w < FRAME.x + FRAME.w - 2 && box.y > FRAME.y + 2 && box.y + box.h < FRAME.y + FRAME.h - 2; }

  boxFor(point: Point, text: string, size: number): Box {
    const w = Math.max(14, text.length * size * 0.6) + 4;
    return { x: point.x - w / 2, y: point.y - size + 1, w, h: size + 3 };
  }

  /** Try candidate offsets around the anchor; returns placement or null. */
  try(anchor: Point, text: string, size: number, candidates: Point[]): { point: Point; leader: boolean } | null {
    for (const [i, offset] of candidates.entries()) {
      const point = { x: anchor.x + offset.x, y: anchor.y + offset.y };
      const box = this.boxFor(point, text, size);
      if (this.inFrame(box) && !this.overlaps(box)) {
        this.reserve(box);
        return { point, leader: i > 0 && Math.hypot(offset.x, offset.y) > 14 };
      }
    }
    return null;
  }

  /** Force placement at the first candidate (registers the obstacle regardless). */
  force(anchor: Point, text: string, size: number, offset: Point = { x: 0, y: 0 }): Point {
    const point = { x: anchor.x + offset.x, y: anchor.y + offset.y };
    this.reserve(this.boxFor(point, text, size));
    return point;
  }
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
  let out = `<g id="graticule" class="thin">`;
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
  for (const taxiway of model.taxiways) {
    const radius = Math.max(1.4, projection.distance(taxiway.width) * 0.62);
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
      const throatLength = Math.min(220, len * 0.5);
      const tip = add(edge, vscale(unit, throatLength));
      const flare: Polygon = [
        add(edge, vscale(side, taxiway.width * 1.7)),
        add(edge, vscale(side, -taxiway.width * 1.7)),
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
  let out = `<g id="runways">`;
  model.runways.forEach((runway, index) => {
    out += runwayShape(runway, index, projection, placer, fonts);
  });
  return `${out}</g>`;
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

  if (runway.closed) {
    // Closed runway: open outline, X's along it, no designators (spec B4).
    out += `<polygon points="${projection.polygon(body)}" fill="${WHITE}" class="thin"/>`;
    const count = Math.max(2, Math.floor(projection.distance(runway.length) / 70));
    for (let i = 0; i < count; i++) {
      const c = projection.point(pointAlong(a, b, (i + 0.5) / count));
      const r = Math.max(4, halfWidthPage * 1.3);
      const u = { x: dirAB.x * r, y: dirAB.y * r };
      const v = { x: sidePage.x * r, y: sidePage.y * r };
      out += `<path d="M${num(c.x - u.x - v.x)} ${num(c.y - u.y - v.y)}L${num(c.x + u.x + v.x)} ${num(c.y + u.y + v.y)}M${num(c.x - u.x + v.x)} ${num(c.y - u.y + v.y)}L${num(c.x + u.x - v.x)} ${num(c.y + u.y - v.y)}" class="thin"/>`;
    }
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
      const anchor = placer.force(labelPoint, "EMAS", fonts.blast, { x: 0, y: 0 });
      out += text(anchor.x, anchor.y, "EMAS", `class="blast halo" text-anchor="middle"`);
    }
  });

  // Displaced thresholds: white chevrons every 220 ft + white bar at the line.
  runway.ends.forEach((end, endIndex) => {
    if (end.displaced <= 0) return;
    const endpoint = endIndex === 0 ? a : b;
    const opposite = endIndex === 0 ? b : a;
    const inward = { x: (opposite.x - endpoint.x) / runway.length, y: (opposite.y - endpoint.y) / runway.length };
    const dIn = projection.direction(inward);
    const sIn = { x: -dIn.y, y: dIn.x };
    const threshold = projection.point(add(endpoint, vscale(inward, end.displaced)));
    const w = halfWidthPage * 0.82;
    out += `<path d="M${num(threshold.x - sIn.x * w)} ${num(threshold.y - sIn.y * w)}L${num(threshold.x + sIn.x * w)} ${num(threshold.y + sIn.y * w)}" stroke="${WHITE}" stroke-width="1.1"/>`;
    const chevrons = Math.max(1, Math.floor(end.displaced / 220));
    for (let k = 0; k < chevrons; k++) {
      const c = projection.point(add(endpoint, vscale(inward, ((k + 0.5) / chevrons) * end.displaced)));
      out += `<path d="M${num(c.x - dIn.x * 2.6 - sIn.x * 2.2)} ${num(c.y - dIn.y * 2.6 - sIn.y * 2.2)}L${num(c.x)} ${num(c.y)}L${num(c.x - dIn.x * 2.6 + sIn.x * 2.2)} ${num(c.y - dIn.y * 2.6 + sIn.y * 2.2)}" fill="none" stroke="${WHITE}" stroke-width=".7"/>`;
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

  // End numbers: outside the threshold clearing blast pad / EMAS, rotated to read
  // from final approach (deliberately not folded).
  runway.ends.forEach((end, endIndex) => {
    if (!end.designator) return;
    const endpoint = endIndex === 0 ? pa : pb;
    const inward = endIndex === 0 ? dirAB : { x: -dirAB.x, y: -dirAB.y };
    const clear = projection.distance(Math.max(end.blastPad, end.emas)) + 13;
    const p = { x: endpoint.x - inward.x * clear, y: endpoint.y - inward.y * clear };
    const rotation = (Math.atan2(inward.x, -inward.y) * 180) / Math.PI;
    placer.reserve(placer.boxFor(p, end.designator, fonts.end));
    out += text(p.x, p.y + fonts.end * 0.36, end.designator, `class="runway-end halo" text-anchor="middle" transform="rotate(${num(rotation)} ${num(p.x)} ${num(p.y)})" font-size="${fonts.end}"`);
  });

  // ELEV at 5.5% of length, opposite side from the heading label at 16%.
  runway.ends.forEach((end, endIndex) => {
    const tElev = endIndex === 0 ? 0.055 : 1 - 0.055;
    const tHeading = endIndex === 0 ? 0.16 : 1 - 0.16;
    const elevPoint = offset(along(tElev), -dimSide, 9);
    const elevLabel = `ELEV ${end.elevation}`;
    placer.reserve(placer.boxFor(elevPoint, elevLabel, fonts.elev));
    out += text(elevPoint.x, elevPoint.y, elevLabel, `class="elev halo" text-anchor="middle" transform="rotate(${num(foldedAngle)} ${num(elevPoint.x)} ${num(elevPoint.y)})" font-size="${fonts.elev}"`);

    const headingPoint = offset(along(tHeading), dimSide, 10);
    const inward = endIndex === 0 ? dirAB : { x: -dirAB.x, y: -dirAB.y };
    const headingLabel = `${end.magneticHeading.toFixed(1).padStart(5, "0")}°`;
    placer.reserve(placer.boxFor(headingPoint, headingLabel, fonts.heading));
    out += text(headingPoint.x, headingPoint.y, headingLabel, `class="hdg halo" text-anchor="middle" transform="rotate(${num(foldedAngle)} ${num(headingPoint.x)} ${num(headingPoint.y)})" font-size="${fonts.heading}"`);
    // Along-runway arrow beside the heading value.
    const arrowBase = offset(along(tHeading + (endIndex === 0 ? 0.045 : -0.045)), dimSide, 10);
    const tip = { x: arrowBase.x + inward.x * 9, y: arrowBase.y + inward.y * 9 };
    const sp = { x: -inward.y, y: inward.x };
    out += `<path d="M${num(arrowBase.x)} ${num(arrowBase.y)}L${num(tip.x)} ${num(tip.y)}M${num(tip.x - inward.x * 3 + sp.x * 2)} ${num(tip.y - inward.y * 3 + sp.y * 2)}L${num(tip.x)} ${num(tip.y)}L${num(tip.x - inward.x * 3 - sp.x * 2)} ${num(tip.y - inward.y * 3 - sp.y * 2)}" class="thin"/>`;
  });

  // One dimension label per runway at midfield, side alternating by index.
  const dimPoint = offset(along(0.5), dimSide, 8);
  const dimLabel = `${runway.length} X ${runway.width}`;
  placer.reserve(placer.boxFor(dimPoint, dimLabel, fonts.dims));
  out += text(dimPoint.x, dimPoint.y, dimLabel, `class="dims halo" text-anchor="middle" transform="rotate(${num(foldedAngle)} ${num(dimPoint.x)} ${num(dimPoint.y)})" font-size="${fonts.dims}"`);
  if (runway.slope >= 0.3) {
    const upEnd = runway.ends[0].elevation > runway.ends[1].elevation ? 0 : 1;
    const slopePoint = offset(along(0.36), dimSide, 8);
    const slopeLabel = `${runway.slope.toFixed(1)}% UP`;
    placer.reserve(placer.boxFor(slopePoint, slopeLabel, fonts.minor));
    out += text(slopePoint.x, slopePoint.y, slopeLabel, `class="minor halo" text-anchor="middle" transform="rotate(${num(foldedAngle)} ${num(slopePoint.x)} ${num(slopePoint.y)})" font-size="${fonts.minor}"`);
    // Uphill arrow drawn as a path (font-independent).
    const uphill = upEnd === 0 ? { x: -dirAB.x, y: -dirAB.y } : dirAB;
    const base = offset(along(0.36 + (upEnd === 0 ? -0.035 : 0.035) * (slopeLabel.length / 8)), dimSide, 8);
    const tip = { x: base.x + uphill.x * 8, y: base.y + uphill.y * 8 };
    const sp = { x: -uphill.y, y: uphill.x };
    out += `<path d="M${num(base.x)} ${num(base.y)}L${num(tip.x)} ${num(tip.y)}M${num(tip.x - uphill.x * 2.6 + sp.x * 1.8)} ${num(tip.y - uphill.y * 2.6 + sp.y * 1.8)}L${num(tip.x)} ${num(tip.y)}L${num(tip.x - uphill.x * 2.6 - sp.x * 1.8)} ${num(tip.y - uphill.y * 2.6 - sp.y * 1.8)}" class="thin"/>`;
  }
  return `${out}</g>`;
}

/** Taxiway letters: repeat along long parallels, first label inset, checkerboard
 * side alternation, 3 candidates with drop-but-keep-≥1 policy (harvest H4/H7). */
function taxiwayLabels(model: SiteModel, projection: Projection, placer: LabelPlacer, fonts: FontScale): string {
  let out = `<g id="taxiway-labels">`;
  model.taxiways.forEach((taxiway, twyIndex) => {
    if (taxiway.unlabeled || !taxiway.name) return;
    const pathLength = taxiway.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - taxiway.points[i]!.x, p.y - taxiway.points[i]!.y), 0);
    const spacing = 2500;
    const count = taxiway.kind === "parallel" || taxiway.kind === "service" ? Math.max(1, Math.round(pathLength / spacing)) : 1;
    let placedAny = false;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : (0.6 * spacing + i * ((pathLength - 1.2 * spacing) / Math.max(1, count - 1))) / pathLength;
      const modelPoint = pointOnPolyline(taxiway.points, Math.max(0.05, Math.min(0.95, t)));
      const anchor = projection.point(modelPoint);
      const side = (i + twyIndex) % 2 === 0 ? 1 : -1;
      const candidates = [
        { x: 6 * side, y: -6 * side },
        { x: -8 * side, y: 8 * side },
        { x: 10, y: 10 },
      ];
      const placed = placer.try(anchor, taxiway.name, fonts.twy, candidates);
      if (placed) {
        out += text(placed.point.x, placed.point.y, taxiway.name, `class="twy halo" text-anchor="middle" font-size="${fonts.twy}"`);
        placedAny = true;
      }
    }
    if (!placedAny) {
      const anchor = projection.point(pointOnPolyline(taxiway.points, 0.5));
      const p = placer.force(anchor, taxiway.name, fonts.twy, { x: 7, y: -7 });
      out += text(p.x, p.y, taxiway.name, `class="twy halo" text-anchor="middle" font-size="${fonts.twy}"`);
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

function buildingsLayer(model: SiteModel, projection: Projection, placer: LabelPlacer, fonts: FontScale): string {
  let out = `<g id="buildings" fill="${BLACK}" stroke="none">`;
  for (const building of model.buildings) {
    out += `<polygon points="${projection.polygon(building.polygon)}"/>`;
    // Buildings are obstacles for later labels.
    const box = bounds(building.polygon.map((p) => projection.point(p)));
    placer.reserve({ x: box.minX - 1, y: box.minY - 1, w: box.maxX - box.minX + 2, h: box.maxY - box.minY + 2 });
  }
  out += `</g><g id="building-labels" class="thin">`;

  for (const building of model.buildings) {
    if (building.unlabeled) continue;
    const anchor = projection.point(areaCentroid(building.polygon));
    if (building.kind === "tower") {
      const label = `TWR ${towerElevation(model)}`;
      const placed = placer.try(anchor, label, fonts.minor, RING.map((o) => ({ x: o.x * 1.4, y: o.y * 1.2 }))) ?? { point: placer.force(anchor, label, fonts.minor, { x: 20, y: -14 }), leader: true };
      out += star(anchor.x, anchor.y - 7, 4.6);
      if (placed.leader) out += `<path d="M${num(anchor.x)} ${num(anchor.y)}L${num(placed.point.x)} ${num(placed.point.y + 2)}"/>`;
      out += text(placed.point.x, placed.point.y, label, `class="minor halo" text-anchor="middle" font-size="${fonts.minor}"`);
      out += text(placed.point.x, placed.point.y + fonts.minor + 1, "BCN", `class="minor halo" text-anchor="middle" font-size="${fonts.minor}"`);
      continue;
    }
    // Building labels drop entirely on collision (tiered policy) — but try a ring first.
    const placed = placer.try(anchor, building.label, fonts.minor, RING.map((o) => ({ x: o.x * 1.6, y: o.y * 1.4 })));
    if (!placed) continue;
    if (placed.leader) out += `<path d="M${num(anchor.x)} ${num(anchor.y)}L${num(placed.point.x)} ${num(placed.point.y + 2)}"/>`;
    out += text(placed.point.x, placed.point.y, building.label, `class="minor halo" text-anchor="middle" font-size="${fonts.minor}"`);
  }

  // Apron labels never drop: force candidate 0 + leader when needed.
  for (const apron of model.aprons) {
    if (!apron.label) continue;
    const anchor = projection.point(areaCentroid(apron.polygon));
    const placed = placer.try(anchor, apron.label, fonts.minor, RING.map((o) => ({ x: o.x * 2, y: o.y * 1.8 })));
    const point = placed?.point ?? placer.force(anchor, apron.label, fonts.minor, { x: 0, y: 0 });
    if (placed?.leader) out += `<path d="M${num(anchor.x)} ${num(anchor.y)}L${num(point.x)} ${num(point.y + 2)}"/>`;
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
      out += `<path d="M${num(placed.point.x - s.x * side * 6)} ${num(placed.point.y + 3)}L${num(p.x + s.x * side * 5)} ${num(p.y + s.y * side * 5)}"/>`;
    }
  }
  return `${out}</g>`;
}

function hotspotLayer(model: SiteModel, projection: Projection, placer: LabelPlacer): string {
  let out = `<g id="hotspots" fill="none" stroke="${BROWN}" class="hotspot">`;
  for (const [index, hotspot] of model.hotspots.entries()) {
    const p = projection.point(hotspot.point);
    const rx = Math.max(7, projection.distance(hotspot.rx));
    const ry = Math.max(5.4, rx * 0.78 * (hotspot.ry / hotspot.rx / 0.78));
    const pageAngle = fold((Math.atan2(projection.direction(polar(hotspot.angle)).y, projection.direction(polar(hotspot.angle)).x) * 180) / Math.PI);
    out += `<ellipse cx="${num(p.x)}" cy="${num(p.y)}" rx="${num(rx)}" ry="${num(ry)}" transform="rotate(${num(pageAngle)} ${num(p.x)} ${num(p.y)})"/>`;
    // Boxed label up-and-right, vertical side alternating by index.
    const vertical = index % 2 === 0 ? -1 : 1;
    const label = `HS ${hotspot.id}`;
    const candidates = [
      { x: rx + 20, y: vertical * (ry + 16) }, { x: -(rx + 24), y: vertical * (ry + 16) },
      { x: rx + 26, y: -vertical * (ry + 18) }, { x: 0, y: vertical * (ry + 26) },
    ];
    const placed = placer.try(p, label, 8, candidates) ?? { point: placer.force(p, label, 8, { x: rx + 20, y: -(ry + 16) }), leader: true };
    const lp = placed.point;
    const toward = { x: p.x - lp.x, y: p.y - lp.y };
    const len = Math.hypot(toward.x, toward.y) || 1;
    const edge = { x: p.x - (toward.x / len) * rx * 0.72, y: p.y - (toward.y / len) * ry * 0.72 };
    out += `<path d="M${num(lp.x)} ${num(lp.y + 3)}L${num(edge.x)} ${num(edge.y)}"/>`;
    out += `<rect x="${num(lp.x - 13)}" y="${num(lp.y - 8)}" width="26" height="12" fill="${WHITE}"/>`;
    out += text(lp.x, lp.y + 1.5, label, `class="hot-text" text-anchor="middle" fill="${BROWN}" stroke="none"`);
  }
  return `${out}</g>`;
}

function commBlock(model: SiteModel, placer: LabelPlacer): string {
  let out = `<g id="comm-block">`;
  let y = 126;
  const x = 70;
  for (const freq of model.frequencies) {
    out += text(x, y, `${freq.label}${freq.partTime ? " ★" : ""}`, `class="small halo"`);
    y += 10;
    out += text(x, y, `${freq.value}${freq.detail ? ` ${freq.detail}` : ""}`, `class="small halo"`);
    y += 11;
  }
  placer.reserve({ x: x - 6, y: 112, w: 210, h: y - 112 });
  return `${out}</g>`;
}

function fieldElevBox(model: SiteModel, placer: LabelPlacer): string {
  const label = `FIELD ELEV ${model.identity.elevation}`;
  const w = label.length * 5.4 + 14;
  const x = FRAME.x + FRAME.w - w - 22;
  placer.reserve({ x, y: 114, w, h: 26 });
  return `<rect x="${num(x)}" y="116" width="${num(w)}" height="21" fill="${WHITE}" class="thin"/>` +
    text(x + w / 2, 130, label, `class="small" text-anchor="middle"`);
}

/** Mag-var assembly (harvest H7): filled true-north head, open-V magnetic head,
 * VAR label on the side away from the magnetic arm, epoch beneath. */
function magVar(model: SiteModel, projection: Projection, placer: LabelPlacer): string {
  const x = 735;
  const y = 700;
  placer.reserve({ x: x - 90, y: y - 14, w: 180, h: 138 });
  const variation = model.identity.variation;
  const sign = variation < 0 ? "W" : "E";
  const northPage = projection.direction({ x: 0, y: 1 });
  const magPage = projection.direction(polar(variation));
  const arm = 62;
  const trueTip = { x: x + northPage.x * arm, y: y + northPage.y * arm };
  const magTip = { x: x + magPage.x * arm * 0.94, y: y + magPage.y * arm * 0.94 };
  const tPerp = { x: -northPage.y, y: northPage.x };
  const mPerp = { x: -magPage.y, y: magPage.x };
  let out = `<g id="mag-var" class="thin">`;
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

function bottomBlocks(model: SiteModel, placer: LabelPlacer): string {
  let out = `<g id="bottom-blocks">`;
  // PCN block: pinned bottom-left.
  const pcnLines = model.runways.filter((r) => !r.closed && r.pcn).map((r) => `RWY ${r.id}  ${r.pcn}`);
  let y = FRAME.y + FRAME.h - 18 - pcnLines.length * 10;
  placer.reserve({ x: 66, y: y - 10, w: 240, h: pcnLines.length * 10 + 14 });
  for (const line of pcnLines) { out += text(70, y, line, `class="minor halo"`); y += 10; }

  // Caution block grows upward from the bottom margin, centered.
  const cautionY = FRAME.y + FRAME.h - 8 - (model.cautions.length - 1) * 12;
  placer.reserve({ x: W / 2 - 210, y: cautionY - 12, w: 420, h: model.cautions.length * 12 + 6 });
  model.cautions.forEach((line, i) => {
    const cls = i === 1 ? "small underline halo" : "small halo";
    out += text(W / 2, cautionY + i * 12, line, `class="${cls}" text-anchor="middle"`);
  });

  // Ramp-frequency table (hubs): boxed, underlined heading, bottom-right.
  if (model.rampFrequencies.length > 0) {
    const rows = model.rampFrequencies;
    const boxH = rows.length * 10 + 22;
    const boxW = 148;
    const bx = FRAME.x + FRAME.w - boxW - 20;
    const by = FRAME.y + FRAME.h - boxH - 46;
    placer.reserve({ x: bx - 4, y: by - 4, w: boxW + 8, h: boxH + 8 });
    out += `<rect x="${num(bx)}" y="${num(by)}" width="${boxW}" height="${num(boxH)}" fill="${WHITE}" class="thin"/>`;
    out += text(bx + 8, by + 13, "RAMP FREQUENCIES", `class="minor underline"`);
    rows.forEach(([name, freq], i) => {
      out += text(bx + 8, by + 26 + i * 10, name!, `class="minor"`);
      out += text(bx + boxW - 8, by + 26 + i * 10, freq!, `class="minor" text-anchor="end"`);
    });
  }

  // Notes as free text above the PCN block.
  let noteY = FRAME.y + FRAME.h - 34 - model.runways.length * 10 - model.notes.length * 11;
  for (const note of model.notes) {
    placer.reserve({ x: 66, y: noteY - 9, w: 230, h: 11 });
    out += text(70, noteY, note, `class="minor halo"`);
    noteY += 11;
  }
  return `${out}</g>`;
}

function margins(model: SiteModel): string {
  const { identity: id } = model;
  const right = `${id.airportName} (${id.id})`;
  const city = `${id.city.toUpperCase()}, ${id.state}`;
  return `<g id="margins">` +
    text(40, 24, model.chartNumber, `class="micro"`) + text(40, 42, "AIRPORT DIAGRAM", `class="title"`) +
    text(W / 2, 37, model.alNumber, `class="margin" text-anchor="middle"`) +
    text(860, 28, right, `class="margin" text-anchor="end"`) + text(860, 42, city, `class="small" text-anchor="end"`) +
    text(40, 1160, city, `class="small"`) + text(40, 1175, right, `class="margin"`) +
    text(W / 2, 1172, model.alNumber, `class="margin" text-anchor="middle"`) + text(860, 1158, model.chartNumber, `class="micro" text-anchor="end"`) +
    text(860, 1178, "AIRPORT DIAGRAM", `class="title" text-anchor="end"`) +
    text(17, H / 2, model.cycle, `class="micro" text-anchor="middle" transform="rotate(-90 17 ${H / 2})"`) +
    text(883, H / 2, model.cycle, `class="micro" text-anchor="middle" transform="rotate(90 883 ${H / 2})"`) + `</g>`;
}

export function render(model: SiteModel): string {
  const projection = new Projection(model);
  const placer = new LabelPlacer();
  const dense = projection.scaleValue / 1 < 0.026 || model.runways.length >= 5;
  const fonts: FontScale = dense
    ? { end: 9.5, heading: 6.5, dims: 7, elev: 6.5, twy: 6, minor: 6, blast: 6 }
    : { end: 10.5, heading: 7.5, dims: 8, elev: 7, twy: 7, minor: 7, blast: 6.5 };

  // Fixed furniture registers first (tiered policy).
  const comm = commBlock(model, placer);
  const fieldElev = fieldElevBox(model, placer);
  const magvar = magVar(model, projection, placer);
  const bottom = bottomBlocks(model, placer);

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

  const runwayInk = runwayLayer(model, projection, placer, fonts);
  const metadata = { seed: model.seed, role: model.role, archetype: model.terminalArchetype, id: model.identity.id, icao: model.identity.icao };
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" role="img" aria-labelledby="chart-title chart-desc">` +
    `<title id="chart-title">${esc(model.identity.airportName)} airport diagram</title><desc id="chart-desc">Procedurally generated fictional FAA-style airport diagram for ${esc(model.identity.city)}, ${esc(model.identity.state)}.</desc>` +
    `<metadata>${esc(JSON.stringify(metadata))}</metadata><defs><style>` +
    `text{font-family:Futura,"Avenir Next",Avenir,"Century Gothic",sans-serif;fill:${BLACK};font-weight:500;letter-spacing:.06em}` +
    `.title{font-size:17px}.margin{font-size:10px}.small{font-size:8px}.micro{font-size:6.5px}` +
    `.runway-end{font-weight:700}.hdg{font-size:7.5px}.dims{font-size:8px}.elev{font-size:7px}.twy{font-size:7px}.minor{font-size:7px}.blast{font-size:6.5px}` +
    `.hdg,.dims,.elev,.twy,.minor,.blast{letter-spacing:.04em}` +
    `.thin{stroke:${BLACK};stroke-width:.52;fill:none}.halo{paint-order:stroke;stroke:${WHITE};stroke-width:2.6px;stroke-linejoin:round}` +
    `.centerlights{fill:none;stroke:${WHITE};stroke-width:.85;stroke-dasharray:.9 3.6;stroke-linecap:butt}` +
    `.hotspot{stroke-width:1.2}.hot-text{font-size:7px;letter-spacing:.03em}.underline{text-decoration:underline}` +
    `</style><clipPath id="plot-clip"><rect x="${FRAME.x + 1}" y="${FRAME.y + 1}" width="${FRAME.w - 2}" height="${FRAME.h - 2}"/></clipPath></defs>` +
    `<rect width="${W}" height="${H}" fill="${WHITE}"/>${margins(model)}<rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" fill="none" stroke="${BLACK}" stroke-width="1.04"/>` +
    `<g clip-path="url(#plot-clip)">${graticule(model, projection, placer)}${pavement(model, projection)}${runwayInk}${holdAndLahso(model, projection, placer, fonts)}${buildingsLayer(model, projection, placer, fonts)}${taxiwayLabels(model, projection, placer, fonts)}${comm}${fieldElev}${magvar}${bottom}${hotspotLayer(model, projection, placer)}</g></svg>`;
}
