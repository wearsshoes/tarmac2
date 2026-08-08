import { add, bounds, headingOf, polar, rect, rotate, runwayEndpoints, scale } from "./geometry";
import type { Point, Polygon, Runway, SiteModel } from "./types";

const W = 900;
const H = 1200;
const FRAME = { x: 38, y: 72, w: 824, h: 1056 };
const PLOT = { x: 62, y: 102, w: 776, h: 970 };
const BLACK = "#000000";
const WHITE = "#FFFFFF";
const GRAY = "#CFCFCF";
const BROWN = "#945101";

const esc = (value: string): string => value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);
const num = (value: number): string => Number(value.toFixed(2)).toString();

class Projection {
  private scaleValue: number;
  private rotation: number;
  private center: Point;

  constructor(model: SiteModel) {
    const primary = model.runways[0]!;
    // Predominantly E/W fields use the FAA landscape convention: north points left.
    this.rotation = primary.heading >= 45 && primary.heading <= 135 ? -90 : 0;
    const rotated = model.parcel.map((p) => rotate(p, this.rotation));
    const box = bounds(rotated);
    this.center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    this.scaleValue = Math.min(PLOT.w / (box.maxX - box.minX), PLOT.h / (box.maxY - box.minY)) * 0.96;
  }

  point(p: Point): Point {
    const q = rotate(p, this.rotation);
    return { x: W / 2 + (q.x - this.center.x) * this.scaleValue, y: PLOT.y + PLOT.h / 2 - (q.y - this.center.y) * this.scaleValue };
  }
  distance(feet: number): number { return feet * this.scaleValue; }
  polygon(points: Polygon): string { return points.map((p) => { const q = this.point(p); return `${num(q.x)},${num(q.y)}`; }).join(" "); }
  angle(heading: number): number {
    const a = this.point({ x: 0, y: 0 });
    const b = this.point(polar(heading, 100));
    return headingOf({ x: a.y, y: a.x }, { x: b.y, y: b.x });
  }
  path(points: Point[]): string { return points.map((p, i) => { const q = this.point(p); return `${i ? "L" : "M"}${num(q.x)} ${num(q.y)}`; }).join(" "); }
}

type Box = { x: number; y: number; w: number; h: number };
class LabelPlacer {
  boxes: Box[] = [];
  reserve(box: Box): void { this.boxes.push(box); }
  overlaps(a: Box): boolean { return this.boxes.some((b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y); }
  place(anchor: Point, text: string, size = 8): { point: Point; leader: boolean } {
    const w = Math.max(20, text.length * size * 0.56) + 6;
    const h = size + 5;
    const offsets = [[0, 0], [18, -15], [-w - 12, -15], [20, 18], [-w - 12, 18], [34, -30], [-w - 28, -30], [34, 34], [-w - 28, 34]];
    for (const [dx, dy] of offsets) {
      const box = { x: anchor.x + dx - 3, y: anchor.y + dy - h + 3, w, h };
      if (!this.overlaps(box) && box.x > FRAME.x && box.x + box.w < FRAME.x + FRAME.w && box.y > FRAME.y && box.y + box.h < FRAME.y + FRAME.h) {
        this.reserve(box);
        return { point: { x: anchor.x + dx, y: anchor.y + dy }, leader: dx !== 0 || dy !== 0 };
      }
    }
    const point = { x: anchor.x + 22, y: anchor.y - 18 };
    this.reserve({ x: point.x - 3, y: point.y - h + 3, w, h });
    return { point, leader: true };
  }
}

function text(x: number, y: number, value: string, attrs = ""): string {
  return `<text x="${num(x)}" y="${num(y)}" ${attrs}>${esc(value)}</text>`;
}

function lines(x: number, y: number, values: string[], lineHeight = 11, attrs = ""): string {
  return values.map((value, i) => text(x, y + i * lineHeight, value, attrs)).join("");
}

function graticule(model: SiteModel): string {
  const { lat, lon } = model.identity;
  const latBase = Math.floor(lat * 60);
  const lonBase = Math.floor(Math.abs(lon) * 60);
  let out = `<g id="graticule" class="thin">`;
  for (let i = 0; i < 3; i++) {
    const y = PLOT.y + 170 + i * 300;
    const minute = latBase - 1 + i;
    const degree = Math.floor(minute / 60);
    const minPart = minute % 60;
    out += `<path d="M${PLOT.x} ${y}H${PLOT.x + PLOT.w}"/>`;
    for (let x = PLOT.x + 32; x < PLOT.x + PLOT.w; x += 65) out += `<path d="M${x} ${y - 3}V${y + 3}"/>`;
    out += text(PLOT.x + PLOT.w - 1, y - 3, `${degree}°${padMinute(minPart)}'N`, `class="micro halo" text-anchor="end"`);
  }
  for (let i = 0; i < 3; i++) {
    const x = PLOT.x + 145 + i * 245;
    const minute = lonBase - 1 + i;
    const degree = Math.floor(minute / 60);
    const minPart = minute % 60;
    out += `<path d="M${x} ${PLOT.y}V${PLOT.y + PLOT.h}"/>`;
    for (let y = PLOT.y + 28; y < PLOT.y + PLOT.h; y += 65) out += `<path d="M${x - 3} ${y}H${x + 3}"/>`;
    out += text(x + 4, PLOT.y + PLOT.h - 4, `${degree}°${padMinute(minPart)}'W`, `class="micro halo"`);
  }
  return `${out}</g>`;
}

function padMinute(value: number): string { return String(Math.abs(value)).padStart(2, "0"); }

function runwayShape(runway: Runway, projection: Projection): string {
  const body = rect(runway.center, runway.width, runway.length, -runway.heading);
  // rect's long axis begins vertical, so the mathematical angle is the negative compass heading.
  let out = `<g id="runway-${esc(runway.id)}">`;
  if (runway.closed) {
    out += `<polygon points="${projection.polygon(body)}" fill="none" class="thin"/>`;
  } else {
    out += `<polygon points="${projection.polygon(body)}" fill="${BLACK}" stroke="none"/>`;
  }
  const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
  const pa = projection.point(a); const pb = projection.point(b);
  const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180 / Math.PI;
  const along = (p: Point, q: Point, distance: number): Point => {
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: p.x + (q.x - p.x) / len * distance, y: p.y + (q.y - p.y) / len * distance };
  };
  const endA = along(pa, pb, 19); const endB = along(pb, pa, 19);
  out += text(endA.x, endA.y + 3, runway.ends[0].designator, `class="runway-id" text-anchor="middle" transform="rotate(${num(angle)} ${num(endA.x)} ${num(endA.y)})"`);
  out += text(endB.x, endB.y + 3, runway.ends[1].designator, `class="runway-id" text-anchor="middle" transform="rotate(${num(angle + 180)} ${num(endB.x)} ${num(endB.y)})"`);
  if (runway.centerlineLights) out += `<path d="M${num(pa.x)} ${num(pa.y)}L${num(pb.x)} ${num(pb.y)}" class="centerlights"/>`;
  const side = { x: -(pb.y - pa.y), y: pb.x - pa.x };
  const sideLen = Math.hypot(side.x, side.y) || 1;
  const labelOffset = Math.max(17, projection.distance(runway.width) / 2 + 11);
  const center = projection.point(runway.center);
  const labelPoint = { x: center.x + side.x / sideLen * labelOffset, y: center.y + side.y / sideLen * labelOffset };
  out += text(labelPoint.x, labelPoint.y, `${runway.length} X ${runway.width}`, `class="plan halo" text-anchor="middle" transform="rotate(${num(angle)} ${num(labelPoint.x)} ${num(labelPoint.y)})"`);
  if (runway.slope >= 0.3) out += text(labelPoint.x, labelPoint.y + 11, `${runway.slope.toFixed(1)}% UP`, `class="micro halo" text-anchor="middle" transform="rotate(${num(angle)} ${num(labelPoint.x)} ${num(labelPoint.y + 11)})"`);

  [pa, pb].forEach((p, index) => {
    const away = index === 0 ? along(p, pa, -1) : along(p, pb, -1);
    const dx = side.x / sideLen * (index ? -18 : 18);
    const dy = side.y / sideLen * (index ? -18 : 18);
    out += text(p.x + dx, p.y + dy, `ELEV ${runway.ends[index]!.elevation}`, `class="micro halo" text-anchor="middle"`);
    const hp = along(index === 0 ? pa : pb, index === 0 ? pb : pa, 46);
    out += text(hp.x + dx, hp.y + dy, `${runway.ends[index]!.magneticHeading.toFixed(1)}° →`, `class="micro halo" text-anchor="middle" transform="rotate(${num(angle + (index ? 180 : 0))} ${num(hp.x + dx)} ${num(hp.y + dy)})"`);
    void away;
  });

  runway.ends.forEach((end, index) => {
    if (!end.treatment) return;
    const endpoint = index === 0 ? a : b;
    const outward = polar(runway.heading + (index === 0 ? 180 : 0), 240);
    const treatmentCenter = add(endpoint, scale(outward, 0.5));
    const treatmentPoly = rect(treatmentCenter, runway.width + 45, 240, -runway.heading);
    if (end.treatment === "emas") {
      out += `<polygon points="${projection.polygon(treatmentPoly)}" fill="${WHITE}" class="thin"/>`;
      const p = projection.point(add(endpoint, outward));
      out += text(p.x, p.y, "EMAS", `class="micro halo" text-anchor="middle"`);
    } else {
      out += `<polygon points="${projection.polygon(treatmentPoly)}" fill="${GRAY}" stroke="none"/>`;
      for (let k = 0; k < 3; k++) {
        const c = add(endpoint, scale(outward, (k + 0.5) / 3));
        const cp = projection.point(c);
        out += `<path d="M${num(cp.x - 5)} ${num(cp.y - 4)}L${num(cp.x)} ${num(cp.y + 3)}L${num(cp.x + 5)} ${num(cp.y - 4)}" class="thin" fill="none"/>`;
      }
    }
  });

  runway.ends.forEach((end, index) => {
    const endpoint = index === 0 ? pa : pb;
    const opposite = index === 0 ? pb : pa;
    if (end.displaced > 0) {
      const threshold = along(endpoint, opposite, projection.distance(end.displaced));
      const vx = (opposite.x - endpoint.x) / (Math.hypot(opposite.x - endpoint.x, opposite.y - endpoint.y) || 1);
      const vy = (opposite.y - endpoint.y) / (Math.hypot(opposite.x - endpoint.x, opposite.y - endpoint.y) || 1);
      const px = -vy; const py = vx;
      out += `<path d="M${num(threshold.x - px * 5)} ${num(threshold.y - py * 5)}L${num(threshold.x + px * 5)} ${num(threshold.y + py * 5)}" stroke="${WHITE}" stroke-width="1.3"/>`;
      for (let k = 0; k < 3; k++) {
        const tip = along(endpoint, threshold, (k + 1) / 4 * Math.max(8, projection.distance(end.displaced)));
        out += `<path d="M${num(tip.x - vx * 3 - px * 2.5)} ${num(tip.y - vy * 3 - py * 2.5)}L${num(tip.x)} ${num(tip.y)}L${num(tip.x - vx * 3 + px * 2.5)} ${num(tip.y - vy * 3 + py * 2.5)}" fill="none" stroke="${WHITE}" stroke-width=".8"/>`;
      }
    }
    if (runway.centerlineLights && !end.treatment) {
      const vx = (opposite.x - endpoint.x) / (Math.hypot(opposite.x - endpoint.x, opposite.y - endpoint.y) || 1);
      const vy = (opposite.y - endpoint.y) / (Math.hypot(opposite.x - endpoint.x, opposite.y - endpoint.y) || 1);
      const px = -vy; const py = vx;
      for (let k = 1; k <= 5; k++) {
        const c = { x: endpoint.x - vx * (k * 5 + 3), y: endpoint.y - vy * (k * 5 + 3) };
        const half = k === 5 ? 7 : 3;
        out += `<path d="M${num(c.x - px * half)} ${num(c.y - py * half)}L${num(c.x + px * half)} ${num(c.y + py * half)}" class="thin"/>`;
      }
      const c = { x: endpoint.x - vx * 34, y: endpoint.y - vy * 34 };
      out += `<circle cx="${num(c.x + px * 11)}" cy="${num(c.y + py * 11)}" r="4" fill="${WHITE}" class="thin"/>`;
      out += text(c.x + px * 11, c.y + py * 11 + 2.2, index ? "M" : "A", `class="micro" text-anchor="middle"`);
    }
  });
  return `${out}</g>`;
}

function taxiways(model: SiteModel, projection: Projection, placer: LabelPlacer): string {
  let out = `<g id="pavement" fill="${GRAY}" stroke="${GRAY}">`;
  for (const apron of model.aprons) out += `<polygon points="${projection.polygon(apron.polygon)}" stroke="none"/>`;
  for (const taxiway of model.taxiways) {
    const path = taxiway.kind === "exit" && taxiway.points.length === 3
      ? (() => { const [a, c, b] = taxiway.points.map((point) => projection.point(point)); return `M${num(a!.x)} ${num(a!.y)}Q${num(c!.x)} ${num(c!.y)} ${num(b!.x)} ${num(b!.y)}`; })()
      : projection.path(taxiway.points);
    out += `<path d="${path}" fill="none" stroke-width="${num(Math.max(2, projection.distance(taxiway.width)))}" stroke-linecap="round" stroke-linejoin="round"/>`;
    // Circular fillet patches make every multi-segment junction read as one paved area.
    for (const p of taxiway.points.slice(1, -1)) {
      const q = projection.point(p);
      out += `<circle cx="${num(q.x)}" cy="${num(q.y)}" r="${num(Math.max(1, projection.distance(taxiway.width) / 2))}" stroke="none"/>`;
    }
  }
  out += `</g><g id="taxiway-labels">`;
  for (const taxiway of model.taxiways) {
    const middle = projection.point(taxiway.points[Math.floor(taxiway.points.length / 2)]!);
    const placed = placer.place(middle, taxiway.name, 7);
    out += text(placed.point.x, placed.point.y, taxiway.name, `class="plan halo" text-anchor="middle"`);
  }
  return `${out}</g>`;
}

function buildings(model: SiteModel, projection: Projection, placer: LabelPlacer): string {
  let out = `<g id="buildings" fill="${BLACK}" stroke="none">`;
  for (const building of model.buildings) out += `<polygon points="${projection.polygon(building.polygon)}"/>`;
  out += `</g><g id="building-labels" class="thin">`;
  const seen = new Set<string>();
  for (const building of model.buildings) {
    if (seen.has(building.label)) continue;
    seen.add(building.label);
    const box = bounds(building.polygon);
    const anchor = projection.point({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
    const placed = placer.place(anchor, building.label, 7);
    if (placed.leader) out += `<path d="M${num(anchor.x)} ${num(anchor.y)}L${num(placed.point.x)} ${num(placed.point.y - 3)}"/>`;
    out += text(placed.point.x, placed.point.y, building.label, `class="plan halo" text-anchor="middle"`);
    if (building.kind === "tower") out += star(anchor.x, anchor.y - 9, 5);
  }
  for (const apron of model.aprons) {
    if (!apron.label) continue;
    const box = bounds(apron.polygon);
    const anchor = projection.point({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
    const placed = placer.place(anchor, apron.label, 7);
    if (placed.leader) out += `<path d="M${num(anchor.x)} ${num(anchor.y)}L${num(placed.point.x)} ${num(placed.point.y - 3)}"/>`;
    out += text(placed.point.x, placed.point.y, apron.label, `class="plan halo" text-anchor="middle"`);
    if (apron.kind === "ga") {
      const box = bounds(apron.polygon);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) {
        const mark = projection.point({ x: box.minX + (col + 1) * (box.maxX - box.minX) / 8, y: box.minY + (row + 1) * (box.maxY - box.minY) / 4 });
        out += `<path d="M${num(mark.x - 2)} ${num(mark.y)}h4M${num(mark.x)} ${num(mark.y - 2)}v4"/>`;
      }
    }
  }
  return `${out}</g>`;
}

function star(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? r * 0.42 : r;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    points.push(`${num(cx + Math.cos(angle) * radius)},${num(cy + Math.sin(angle) * radius)}`);
  }
  return `<polygon points="${points.join(" ")}" fill="${WHITE}" stroke="${BLACK}" class="thin"/>`;
}

function holdLines(model: SiteModel, projection: Projection): string {
  let out = `<g id="hold-lines" class="thin">`;
  for (const hold of model.holdLines) {
    const center = projection.point(hold.point);
    const axisEnd = projection.point(add(hold.point, polar(hold.angle + 90, 80)));
    const dx = axisEnd.x - center.x; const dy = axisEnd.y - center.y;
    const len = Math.hypot(dx, dy) || 1; const nx = dx / len; const ny = dy / len;
    for (const offset of [-2.2, 2.2]) out += `<path d="M${num(center.x - nx * 6 + -ny * offset)} ${num(center.y - ny * 6 + nx * offset)}L${num(center.x + nx * 6 + -ny * offset)} ${num(center.y + ny * 6 + nx * offset)}"/>`;
  }
  if (model.role.includes("hub") && model.holdLines.length > 3) {
    const ils = projection.point(model.holdLines[2]!.point);
    out += text(ils.x + 10, ils.y - 8, "ILS HOLD", `class="micro halo"`);
    const runway = model.runways[0]!;
    const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
    const la = projection.point({ x: a.x + (b.x - a.x) * .58, y: a.y + (b.y - a.y) * .58 });
    out += `<path d="M${num(la.x - 8)} ${num(la.y)}c0-4 6-4 6 0s6 4 6 0M${num(la.x - 8)} ${num(la.y + 4)}c0-4 6-4 6 0s6 4 6 0"/>`;
    out += text(la.x + 9, la.y + 2, "LAHSO", `class="micro halo"`);
  }
  return `${out}</g>`;
}

function furniture(model: SiteModel): string {
  const id = model.identity;
  const freqLines = model.frequencies.flatMap((f) => [f.label, `  ${f.value}${f.detail ? ` ${f.detail}` : ""}`]);
  const pcnLines = model.runways.map((r) => `RWY ${r.id}  PCN ${r.pcn}`);
  let out = `<g id="furniture">`;
  out += lines(72, 128, freqLines, 10, `class="small halo"`);
  out += `<rect x="700" y="116" width="120" height="25" fill="${WHITE}" class="thin"/>`;
  out += text(760, 132, `FIELD ELEV ${id.elevation}`, `class="small" text-anchor="middle"`);
  out += lines(72, 1012, pcnLines, 10, `class="micro halo"`);
  if (model.role.includes("hub")) {
    out += `<rect x="677" y="905" width="140" height="72" fill="${WHITE}" class="thin"/>`;
    out += text(686, 918, "RAMP FREQUENCIES", `class="micro underline"`);
    out += lines(686, 932, ["RAMP 1  131.45", "RAMP 2  129.75", "RAMP 3  130.20", "D-ATIS AVBL"], 10, `class="micro"`);
    out += text(678, 997, "RUNWAY STATUS LIGHTS IN OPERATION.", `class="micro halo"`);
  }
  out += magVar(model);
  out += `<g transform="translate(443 1052)">`;
  out += text(0, 0, "CAUTION: BE ALERT TO RUNWAY CROSSING CLEARANCES.", `class="small halo" text-anchor="middle"`);
  out += text(0, 13, "READBACK OF ALL RUNWAY HOLDING INSTRUCTIONS IS REQUIRED.", `class="small underline halo" text-anchor="middle"`);
  out += `</g></g>`;
  return out;
}

function magVar(model: SiteModel): string {
  const x = 755; const y = 790;
  const sign = model.identity.variation < 0 ? "W" : "E";
  return `<g id="mag-var" class="thin"><path d="M${x} ${y + 75}V${y}"/><path d="M${x - 4} ${y + 8}L${x} ${y}L${x + 4} ${y + 8}"/>` +
    `<path d="M${x} ${y + 68}L${x + (model.identity.variation < 0 ? -18 : 18)} ${y + 2}"/><path d="M${x + (model.identity.variation < 0 ? -21 : 15)} ${y + 10}L${x + (model.identity.variation < 0 ? -18 : 18)} ${y + 2}L${x + (model.identity.variation < 0 ? -12 : 21)} ${y + 8}"/>` +
    text(x + 8, y + 18, "N", `class="micro"`) + text(x - 56, y + 88, `VAR ${Math.abs(model.identity.variation).toFixed(1)}° ${sign}`, `class="micro"`) +
    text(x - 56, y + 99, "JANUARY 2026", `class="micro"`) + text(x - 56, y + 110, "ANNUAL RATE OF CHANGE 0.1° W", `class="micro"`) + `</g>`;
}

function hotspots(model: SiteModel, projection: Projection): string {
  let out = `<g id="hotspots" fill="none" stroke="${BROWN}" class="hotspot">`;
  for (const hotspot of model.hotspots) {
    const p = projection.point(hotspot.point);
    const rx = Math.max(10, projection.distance(hotspot.rx));
    const ry = Math.max(7, projection.distance(hotspot.ry));
    const lx = Math.min(FRAME.x + FRAME.w - 40, p.x + 38);
    const ly = Math.max(FRAME.y + 20, p.y - 34);
    out += `<ellipse cx="${num(p.x)}" cy="${num(p.y)}" rx="${num(rx)}" ry="${num(ry)}" transform="rotate(${num(projection.angle(hotspot.angle))} ${num(p.x)} ${num(p.y)})"/>`;
    out += `<path d="M${num(p.x + rx * .6)} ${num(p.y - ry * .4)}L${num(lx)} ${num(ly + 4)}"/>`;
    out += `<rect x="${num(lx - 15)}" y="${num(ly - 9)}" width="34" height="16" fill="${WHITE}"/>`;
    out += text(lx + 2, ly + 3, `HS ${hotspot.id}`, `class="hot-text" text-anchor="middle" fill="${BROWN}" stroke="none"`);
  }
  return `${out}</g>`;
}

function margins(model: SiteModel): string {
  const { identity: id } = model;
  const right = `${id.airportName.toUpperCase()} (${id.id})`;
  return `<g id="margins">` +
    text(40, 24, model.chartNumber, `class="micro"`) + text(40, 42, "AIRPORT DIAGRAM", `class="title"`) +
    text(W / 2, 37, model.alNumber, `class="margin" text-anchor="middle"`) +
    text(860, 28, right, `class="margin" text-anchor="end"`) + text(860, 42, `${id.city.toUpperCase()}, ${id.state}`, `class="small" text-anchor="end"`) +
    text(40, 1160, `${id.city.toUpperCase()}, ${id.state}`, `class="small"`) + text(40, 1175, right, `class="margin"`) +
    text(W / 2, 1172, model.alNumber, `class="margin" text-anchor="middle"`) + text(860, 1158, model.chartNumber, `class="micro" text-anchor="end"`) +
    text(860, 1178, "AIRPORT DIAGRAM", `class="title" text-anchor="end"`) +
    text(17, H / 2, model.cycle, `class="micro" text-anchor="middle" transform="rotate(-90 17 ${H / 2})"`) +
    text(883, H / 2, model.cycle, `class="micro" text-anchor="middle" transform="rotate(90 883 ${H / 2})"`) + `</g>`;
}

export function render(model: SiteModel): string {
  const projection = new Projection(model);
  const placer = new LabelPlacer();
  placer.reserve({ x: 65, y: 108, w: 190, h: 110 });
  placer.reserve({ x: 690, y: 108, w: 135, h: 45 });
  placer.reserve({ x: 62, y: 980, w: 400, h: 90 });
  placer.reserve({ x: 666, y: 770, w: 160, h: 240 });
  const metadata = { seed: model.seed, role: model.role, archetype: model.terminalArchetype, id: model.identity.id };
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" role="img" aria-labelledby="chart-title chart-desc">` +
    `<title id="chart-title">${esc(model.identity.airportName)} airport diagram</title><desc id="chart-desc">Procedurally generated fictional FAA-style airport diagram for ${esc(model.identity.city)}, ${esc(model.identity.state)}.</desc>` +
    `<metadata>${esc(JSON.stringify(metadata))}</metadata><defs><style>` +
    `text{font-family:Futura,"Avenir Next",Avenir,"Century Gothic",sans-serif;fill:${BLACK};font-weight:500;letter-spacing:.08em}` +
    `.title{font-size:17px}.margin{font-size:10px}.small{font-size:8px}.plan{font-size:7px}.micro{font-size:6.5px}.runway-id{font-size:9px;fill:${WHITE};letter-spacing:.02em}` +
    `.thin{stroke:${BLACK};stroke-width:.52;fill:none;vector-effect:non-scaling-stroke}.halo{paint-order:stroke;stroke:${WHITE};stroke-width:3px;stroke-linejoin:round}.centerlights{fill:none;stroke:${WHITE};stroke-width:1.4;stroke-dasharray:1 7;stroke-linecap:round}` +
    `.hotspot{stroke-width:1.25}.hot-text{font-size:7px;letter-spacing:.03em}.underline{text-decoration:underline}` +
    `</style><clipPath id="plot-clip"><rect x="${FRAME.x + 1}" y="${FRAME.y + 1}" width="${FRAME.w - 2}" height="${FRAME.h - 2}"/></clipPath></defs>` +
    `<rect width="${W}" height="${H}" fill="${WHITE}"/>${margins(model)}<rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" fill="none" stroke="${BLACK}" stroke-width="1.04"/>` +
    `<g clip-path="url(#plot-clip)">${graticule(model)}${taxiways(model, projection, placer)}${runwayShapeList(model, projection)}${holdLines(model, projection)}${buildings(model, projection, placer)}${furniture(model)}${hotspots(model, projection)}</g></svg>`;
}

function runwayShapeList(model: SiteModel, projection: Projection): string {
  return `<g id="runways">${model.runways.map((runway) => runwayShape(runway, projection)).join("")}</g>`;
}
