import { traceUnion } from "./outline";
import type { RNG } from "./rng";
import type { AccretionOp, AircraftClass, Apron, Building, ComponentConnection, ComponentEdge, EdgeRole, Point, Role, Stand, Taxilane, TerminalArchetype, TerminalComponent, TerminalSystem, TerminalUnit } from "./types";

/** Program-first terminal generator (terminal-generator-plan.md, bounding 2.5).
 *
 * Pipeline: program → hierarchy → site frame (landside envelope + road courts) →
 * family → component geometry with edge roles → stands → taxilanes/collectors →
 * derived apron bands → accretion. Everything is authored in a local (u, v)
 * frame with +v pointing airside; the caller supplies at(u, v) → world.
 *
 * The apron is many purposeful pieces (gate bands, alley/collector ribbons,
 * root residuals), never a bounding rectangle: overlapping same-gray pieces
 * render identically to their union on an FAA sheet (edit-plan decision 4). */

export interface TerminalComplex {
  /** The family actually built (the prior is honored only when feasible). */
  family: TerminalArchetype;
  buildings: Building[];
  aprons: Apron[];
  /** u-stations along the apron's airside edge where throat stubs meet taxiways. */
  throats: number[];
  /** v of the apron's airside edge. */
  apronEdgeV: number;
  extentU: [number, number];
  system: TerminalSystem;
  stands: Stand[];
  taxilanes: Taxilane[];
}

type Frame = (u: number, v: number) => Point;
type UV = { u: number; v: number };

// Dimensions from terminal-design.md: gate pitch / stand depth by design class,
// taxilane and collector widths.
const PITCH: Record<AircraftClass, number> = { regional: 110, narrow: 150, wide: 230 };
const DEPTH: Record<AircraftClass, number> = { regional: 100, narrow: 140, wide: 190 };
const ALLEY = 170;
const COLLECTOR_W = 220;

const CONCOURSE_LETTERS = "ABCDEFGH";

function ccw(points: UV[]): UV[] {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.u * b.v - b.u * a.v;
  }
  return area >= 0 ? points : points.slice().reverse();
}

/** Outward normal of edge a→b on a CCW polygon. */
function outwardOf(a: UV, b: UV): UV {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const len = Math.hypot(du, dv) || 1;
  return { u: dv / len, v: -du / len };
}

/** Notched processor box: airside face straight, landside ends recessed ~40 ft
 * over the outer ~28% margins — the subtle silhouette real chart buildings have. */
function notchedBox(u0: number, v0: number, length: number, depth: number): UV[] {
  const L = length / 2;
  const m = length * 0.28;
  const notch = 40;
  return ccw([
    { u: u0 - L, v: v0 + depth / 2 }, { u: u0 + L, v: v0 + depth / 2 },
    { u: u0 + L, v: v0 - depth / 2 + notch }, { u: u0 + L - m, v: v0 - depth / 2 + notch },
    { u: u0 + L - m, v: v0 - depth / 2 }, { u: u0 - L + m, v: v0 - depth / 2 },
    { u: u0 - L + m, v: v0 - depth / 2 + notch }, { u: u0 - L, v: v0 - depth / 2 + notch },
  ]);
}

function bar(u0: number, v0: number, length: number, width: number): UV[] {
  return ccw([
    { u: u0 - length / 2, v: v0 - width / 2 }, { u: u0 + length / 2, v: v0 - width / 2 },
    { u: u0 + length / 2, v: v0 + width / 2 }, { u: u0 - length / 2, v: v0 + width / 2 },
  ]);
}

/** Rotate a polygon about a pivot — the geometric half of accretion. A pier that
 * grew toward a different apron isn't parallel to its neighbors. */
function rotateAbout(poly: UV[], pivot: UV, angle: number): UV[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return poly.map((p) => {
    const du = p.u - pivot.u;
    const dv = p.v - pivot.v;
    return { u: pivot.u + du * cos - dv * sin, v: pivot.v + du * sin + dv * cos };
  });
}

/** A finger that changes direction partway out: straight from the root to the
 * knee, then swung by `angle` for the remainder. Real piers bend where a later
 * phase chased a different apron edge (ORD C, DFW E) — a single dogleg reads as
 * built history, where a rectangle reads as a diagram. */
function kinkedFinger(u0: number, root: number, length: number, width: number, knee: number, angle: number): UV[] {
  const kneeV = root + length * knee;
  const dirU = Math.sin(angle);
  const dirV = Math.cos(angle);
  const rest = length * (1 - knee);
  const tipU = u0 + dirU * rest;
  const tipV = kneeV + dirV * rest;
  // Half-width offsets: axis-aligned to the knee, then normal to the swung leg.
  const nU = dirV * (width / 2);
  const nV = -dirU * (width / 2);
  return ccw([
    { u: u0 - width / 2, v: root }, { u: u0 + width / 2, v: root },
    { u: u0 + width / 2, v: kneeV }, { u: tipU + nU, v: tipV + nV },
    { u: tipU - nU, v: tipV - nV }, { u: u0 - width / 2, v: kneeV },
  ]);
}

/** A linear terminal whose second phase followed the apron edge instead of the
 * original axis: two wings meeting at the centerline, so both the airside face
 * and the landside curb read as a shallow V rather than one straight line. */
function bentBar(length: number, depth: number, angle: number): UV[] {
  const half = length / 2;
  const dirU = Math.cos(angle);
  const dirV = Math.sin(angle);
  // Right wing tip, swung; left wing stays on the axis.
  const tipU = dirU * half;
  const tipV = dirV * half;
  const nU = -dirV * (depth / 2);
  const nV = dirU * (depth / 2);
  return ccw([
    { u: -half, v: -depth / 2 }, { u: 0, v: -depth / 2 },
    { u: tipU + nU, v: tipV + nV }, { u: tipU - nU, v: tipV - nV },
    { u: 0, v: depth / 2 }, { u: -half, v: depth / 2 },
  ]);
}

/** Articulate a face: replace one long straight edge with a run of shallow
 * setbacks and projections.
 *
 * Measured against reference/real-airports/faa, real terminal masses carry a
 * p75 of ~69 vertices where a plain box has 4. That difference is not styling —
 * it is jetway roots, baggage wings, service bays and phase joints, all of which
 * a chart draws as small steps in the outline. Steps are shallow relative to the
 * building depth so the silhouette still reads as one mass.
 *
 * `bias` pushes steps outward (+1) or inward (-1); gate faces bulge toward the
 * apron at jetway roots, landside faces recess for curb frontage. */
function articulate(a: UV, b: UV, steps: number, depth: number, bias: number, jitter: () => number): UV[] {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const len = Math.hypot(du, dv);
  if (steps < 1 || len < 120) return [a];
  const dirU = du / len;
  const dirV = dv / len;
  // Outward normal for a CCW ring is (dv, -du) normalised.
  const nU = dirV;
  const nV = -dirU;
  const out: UV[] = [a];
  // Each step occupies a slot; the notch sits inside its slot with margins, so
  // adjacent steps never merge into one long offset run.
  for (let i = 0; i < steps; i++) {
    const t0 = (i + 0.18 + jitter() * 0.12) / steps;
    const t1 = (i + 0.82 - jitter() * 0.12) / steps;
    const d = depth * (0.55 + jitter() * 0.75) * bias;
    const p0 = { u: a.u + dirU * len * t0, v: a.v + dirV * len * t0 };
    const p1 = { u: a.u + dirU * len * t1, v: a.v + dirV * len * t1 };
    out.push(
      p0,
      { u: p0.u + nU * d, v: p0.v + nV * d },
      { u: p1.u + nU * d, v: p1.v + nV * d },
      p1,
    );
  }
  return out;
}

/** Rebuild a polygon with its long edges articulated. Short edges pass through,
 * so caps and connector stubs keep their clean geometry. */
function articulatePolygon(poly: UV[], rng: RNG, intensity: number): UV[] {
  if (intensity <= 0) return poly;
  const out: UV[] = [];
  const perimeter = poly.reduce((sum, p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    return sum + Math.hypot(q.u - p.u, q.v - p.v);
  }, 0);
  const typical = perimeter / poly.length;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(b.u - a.u, b.v - a.v);
    // Only faces meaningfully longer than the shape's typical edge get steps;
    // this keeps articulation on the long frontages where real detail lives.
    if (len < Math.max(200, typical * 0.8) || !rng.chance(intensity)) {
      out.push(a);
      continue;
    }
    // Few, deep steps rather than many shallow ones: at chart scale a run of
    // small notches reads as a ragged edge — noise — where one or two decisive
    // wings read as building. Depth is a real fraction of the mass.
    const steps = Math.max(1, Math.min(2, Math.floor(len / rng.float(700, 1100))));
    const depth = Math.min(len * 0.13, rng.float(70, 150));
    out.push(...articulate(a, b, steps, depth, rng.chance(0.62) ? 1 : -1, () => rng.next()));
  }
  return out.length >= 3 ? out : poly;
}

/** Arc band for curved terminals: chord half-length h, sag s → R = (h²+s²)/2s.
 * Convex side faces +v (airside). */
function arcBand(u0: number, v0: number, chord: number, sag: number, width: number): UV[] {
  const h = chord / 2;
  const R = (h * h + sag * sag) / (2 * sag);
  const vc = v0 + sag - R;
  const theta = Math.asin(h / R);
  const points: UV[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const a = -theta + (2 * theta * i) / steps;
    points.push({ u: u0 + Math.sin(a) * (R + width / 2), v: vc + Math.cos(a) * (R + width / 2) });
  }
  for (let i = steps; i >= 0; i--) {
    const a = -theta + (2 * theta * i) / steps;
    points.push({ u: u0 + Math.sin(a) * (R - width / 2), v: vc + Math.cos(a) * (R - width / 2) });
  }
  return ccw(points);
}

/** Chord-clipped bulge for rotunda/pod pier caps. */
function bulge(uA: number, uB: number, v0: number, r: number): UV[] {
  const uc = (uA + uB) / 2;
  const vc = v0 - 0.35 * r;
  const points: UV[] = [];
  const steps = 12;
  const a0 = Math.atan2(v0 - vc, uA - uc);
  const a1 = Math.atan2(v0 - vc, uB - uc);
  let sweep = a1 - a0;
  while (sweep > 0) sweep -= 2 * Math.PI;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + sweep * (i / steps);
    points.push({ u: uc + Math.cos(a) * r, v: vc + Math.sin(a) * r });
  }
  return ccw(points);
}

// --- Program ---

interface Program {
  gates: number;
  mix: readonly (readonly [AircraftClass, number])[];
  unitCount: number;
}

function programFor(role: Role, family: TerminalArchetype, rng: RNG): Program {
  const gates =
    role === "business-ga" ? rng.int(3, 8) :
    role === "regional" ? rng.int(5, 20) :
    role === "mid-hub" ? rng.int(18, 55) :
    role === "major-hub" ? rng.int(50, 120) : rng.int(80, 170);
  const mix =
    role === "mid-hub" ? ([["regional", 0.3], ["narrow", 0.6], ["wide", 0.1]] as const) :
    role === "major-hub" ? ([["regional", 0.12], ["narrow", 0.6], ["wide", 0.28]] as const) :
    role === "mega-hub" ? ([["regional", 0.05], ["narrow", 0.55], ["wide", 0.4]] as const) :
    ([["regional", 0.55], ["narrow", 0.45]] as const);
  const unitCount =
    family === "unit" ? (role === "mega-hub" ? rng.int(4, 5) : role === "major-hub" ? rng.int(3, 4) : rng.int(2, 3)) :
    family === "semicircle" ? (role === "mega-hub" ? rng.int(3, 5) : rng.int(2, 3)) : 1;
  return { gates, mix, unitCount };
}

/** Family selection: the role's prior (or override) is honored only when the
 * program can actually fill it; otherwise the nearest feasible family. */
function feasibleFamily(prior: TerminalArchetype, gates: number): TerminalArchetype {
  const fits: Record<Exclude<TerminalArchetype, "none">, boolean> = {
    linear: gates <= 26,
    pier: gates >= 6,
    satellite: gates >= 25,
    parallel: gates >= 35,
    unit: gates >= 24,
    semicircle: gates >= 24,
  };
  if (prior === "none") return "none";
  if (fits[prior]) return prior;
  return prior === "pier" ? "linear" : gates >= 6 ? "pier" : "linear";
}

// --- Component construction ---

interface FaceRule {
  role: (outward: UV, index: number) => EdgeRole;
  gateClass?: AircraftClass;
}

interface Comp {
  id: string;
  unitId: string;
  kind: TerminalComponent["kind"];
  connection: ComponentConnection;
  /** Structural shape: classification, stands and apron bands all derive from
   * this, so it stays clean and its long faces stay single edges. */
  poly: UV[];
  /** Silhouette actually drawn — `poly` with its long faces articulated. Kept
   * separate so a jetway-root bulge never becomes its own "gate face". */
  drawnPoly: UV[];
  faces: { role: EdgeRole; a: UV; b: UV; outward: UV; aircraftClass?: AircraftClass }[];
  drawn: boolean;
  label: string;
  buildingKind: Building["kind"];
  unlabeled?: boolean;
}

function makeComp(id: string, unitId: string, kind: TerminalComponent["kind"], connection: ComponentConnection, poly: UV[], rule: FaceRule, label: string, buildingKind: Building["kind"], drawn = true, unlabeled = false): Comp {
  const faces: Comp["faces"] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (Math.hypot(b.u - a.u, b.v - a.v) < 1) continue;
    const outward = outwardOf(a, b);
    const role = rule.role(outward, i);
    faces.push({ role, a, b, outward, aircraftClass: role === "gate-face" ? rule.gateClass : undefined });
  }
  return { id, unitId, kind, connection, poly, drawnPoly: poly, faces, drawn, label, buildingKind, unlabeled };
}

/** Draw a gate class for a face from the program mix. */
function faceClass(rng: RNG, mix: Program["mix"]): AircraftClass {
  return rng.weighted(mix as readonly (readonly [AircraftClass, number])[]);
}

// Standard face rules.
const pierRule = (gateClass: AircraftClass): FaceRule => ({
  gateClass,
  role: (o) => (Math.abs(o.u) > 0.7 ? "gate-face" : o.v > 0.7 ? "expansion-end" : "internal"),
});
const horizontalBarRule = (gateClass: AircraftClass): FaceRule => ({
  gateClass,
  role: (o) => (Math.abs(o.v) > 0.7 ? "gate-face" : "expansion-end"),
});
const processorRule = (airside: EdgeRole): FaceRule => ({
  role: (o) => (o.v > 0.7 ? airside : o.v < -0.7 ? "landside-curb" : "expansion-end"),
});
const allGates = (gateClass: AircraftClass): FaceRule => ({ gateClass, role: () => "gate-face" });
const serviceRule: FaceRule = { role: () => "service" };
const connectorRule: FaceRule = { role: () => "connector" };
const crescentRule = (gateClass: AircraftClass): FaceRule => ({
  gateClass,
  role: (o) => (o.v > 0.25 ? "gate-face" : o.v < -0.25 ? "landside-curb" : "internal"),
});

// --- Main build ---

export function buildTerminal(rng: RNG, role: Role, archetypePrior: TerminalArchetype, at: Frame): TerminalComplex {
  // Independent streams: silhouette detail must not change the gate program.
  const programRng = rng.derive("program");
  const dimsRng = rng.derive("dims");
  const accretionRng = rng.derive("accretion");
  const detailRng = rng.derive("silhouette");

  const preProgram = programFor(role, archetypePrior, programRng);
  const family = feasibleFamily(archetypePrior, preProgram.gates);
  const program: Program = { ...preProgram, unitCount: programFor(role, family, programRng.derive("units")).unitCount };

  const comps: Comp[] = [];
  const roadCourts: UV[][] = [];
  const accretion: AccretionOp[] = [];
  const cause = (): string => accretionRng.pick([
    "gate demand growth", "widebody bank added", "phased construction", "landside constraint", "alliance consolidation",
  ]);

  // Landside envelope numbers bound processor depth and unit spacing (2.5 driver).
  const parkingDepth = dimsRng.float(300, 600);
  const processorDepthFor = (drawn: number): number => Math.min(drawn, Math.max(190, parkingDepth * 0.75));

  interface UnitSpec { id: string; name: string; curbLength: number; parkingDepth: number; court: UV[] }
  const unitSpecs: UnitSpec[] = [];

  const addUnit = (unitIndex: number, u0: number, name: string, processorLength: number, processorDepth: number): UnitSpec => {
    const curbLength = processorLength * dimsRng.float(1, 1.25);
    const unit: UnitSpec = {
      id: `unit-${unitIndex}`,
      name,
      curbLength,
      parkingDepth,
      court: [
        { u: u0 - curbLength / 2, v: -processorDepth / 2 - parkingDepth },
        { u: u0 + curbLength / 2, v: -processorDepth / 2 - parkingDepth },
        { u: u0 + curbLength / 2, v: -processorDepth / 2 },
        { u: u0 - curbLength / 2, v: -processorDepth / 2 },
      ],
    };
    unitSpecs.push(unit);
    return unit;
  };

  // --- Family layouts (components + accretion applied to their specs) ---

  if (family === "linear") {
    const gateClass = faceClass(dimsRng, program.mix);
    let length = Math.max(700, program.gates * PITCH[gateClass] * dimsRng.float(1, 1.15));
    const depth = processorDepthFor(dimsRng.float(170, 260));
    let bend = 0;
    const ops = accretionRng.int(2, 3);
    for (let i = 0; i < ops; i++) {
      const roll = accretionRng.next();
      if (roll < 0.4) {
        length *= accretionRng.float(1.12, 1.25);
        accretion.push({ op: "lengthen", componentId: "comp-processor-0", cause: cause() });
      } else if (roll < 0.7 && bend === 0) {
        // The extension followed the apron edge rather than the original axis.
        bend = accretionRng.float(0.09, 0.2) * (accretionRng.chance(0.5) ? 1 : -1);
        accretion.push({ op: "kink", componentId: "comp-processor-0", cause: cause() });
      } else {
        accretion.push({ op: "infill-processor", componentId: "comp-processor-0", cause: cause() });
      }
    }
    // A single linear frontage tops out around 2,400 ft; larger programs
    // degrade to fewer stands rather than an implausible mile-long bar.
    length = Math.min(length, 2400);
    const infilled = accretion.some((op) => op.op === "infill-processor");
    addUnit(0, 0, "TERMINAL", length, depth);
    // A bent linear terminal is two collinear-rooted wings meeting at the
    // centerline: the airside face becomes a shallow V, so the gate band and
    // the stand row follow it instead of lying on one straight line.
    const poly = bend !== 0 ? bentBar(length, depth, bend) : infilled ? bar(0, 0, length, depth) : notchedBox(0, 0, length, depth);
    comps.push(makeComp("comp-processor-0", "unit-0", "processor", "attached", poly, { ...processorRule("gate-face"), gateClass }, "TERMINAL", "terminal"));
    if (detailRng.chance(0.35)) {
      const stubU = (detailRng.chance(0.5) ? 1 : -1) * length * 0.32;
      comps.push(makeComp("comp-concourse-0", "unit-0", "concourse", "attached", bar(stubU, depth / 2 + 200, 110, 400), pierRule(gateClass), "TERMINAL", "concourse", true, true));
    }
  } else if (family === "pier") {
    const hub = role.includes("hub");
    let processorLength = hub ? dimsRng.float(1100, 1700) : dimsRng.float(800, 1200);
    const processorDepth = processorDepthFor(dimsRng.float(200, 300));
    interface PierSpec { length: number; width: number; cap: "none" | "tee" | "pod" | "rotunda"; gateClass: AircraftClass; detached: boolean; connection: ComponentConnection; skew: number; kink: number }
    const pierCount = Math.max(1, Math.min(6, Math.round(program.gates / (hub ? 24 : 12))));
    const piers: PierSpec[] = Array.from({ length: pierCount }, (_, i) => ({
      length: (hub ? dimsRng.float(900, 1500) : dimsRng.float(650, 1050)) * (i % 2 ? 0.85 : 1),
      width: dimsRng.float(100, hub ? 160 : 130),
      cap: detailRng.pick(["none", "tee", "pod", "rotunda"] as const),
      gateClass: faceClass(dimsRng, program.mix),
      detached: false,
      connection: "attached",
      skew: 0,
      kink: 0,
    }));
    // Accretion: growth ops recorded with causes, giving earned irregularity.
    const ops = accretionRng.int(2, 4);
    for (let i = 0; i < ops; i++) {
      const roll = accretionRng.next();
      if (roll < 0.28 && piers.length > 0) {
        const idx = accretionRng.int(0, piers.length - 1);
        piers[idx]!.length *= accretionRng.float(1.15, 1.3);
        accretion.push({ op: "lengthen", componentId: `comp-pier-${idx}`, cause: cause() });
      } else if (roll < 0.44) {
        piers.push({
          length: dimsRng.float(700, 1200), width: dimsRng.float(100, 150),
          cap: "none", gateClass: faceClass(accretionRng, program.mix), detached: false, connection: "attached",
          skew: 0, kink: 0,
        });
        accretion.push({ op: "add-pier", componentId: `comp-pier-${piers.length - 1}`, cause: cause() });
      } else if (roll < 0.58) {
        // Outer piers swing off-axis: the later phase chased a different apron.
        const idx = accretionRng.chance(0.7) ? piers.length - 1 : accretionRng.int(0, piers.length - 1);
        piers[idx]!.skew = accretionRng.float(0.1, 0.28) * (accretionRng.chance(0.5) ? 1 : -1);
        accretion.push({ op: "skew", componentId: `comp-pier-${idx}`, cause: cause() });
      } else if (roll < 0.7) {
        const idx = accretionRng.int(0, piers.length - 1);
        piers[idx]!.kink = accretionRng.float(0.14, 0.34) * (accretionRng.chance(0.5) ? 1 : -1);
        accretion.push({ op: "kink", componentId: `comp-pier-${idx}`, cause: cause() });
      } else if (roll < 0.82) {
        const idx = accretionRng.int(0, piers.length - 1);
        piers[idx]!.cap = accretionRng.pick(["tee", "pod", "rotunda"] as const);
        accretion.push({ op: "cap-pier", componentId: `comp-pier-${idx}`, cause: cause() });
      } else if (roll < 0.92 && hub) {
        const idx = piers.length - 1;
        piers[idx]!.detached = true;
        piers[idx]!.connection = accretionRng.pick(["bridge", "bridge", "tunnel", "at-grade"] as const);
        accretion.push({ op: "detach-satellite", componentId: `comp-pier-${idx}`, cause: cause() });
      } else {
        accretion.push({ op: "infill-processor", componentId: "comp-processor-0", cause: cause() });
      }
    }
    // Pier pitch is derived, not drawn: opposing stand envelopes + shared alley.
    const pitches = piers.map((p) => p.width + 2 * DEPTH[p.gateClass] + ALLEY);
    const maxPitch = Math.max(...pitches);
    processorLength = Math.max(processorLength, piers.length * maxPitch * 0.9);
    addUnit(0, 0, "TERMINAL", processorLength, processorDepth);
    const infilled = accretion.some((op) => op.op === "infill-processor");
    comps.push(makeComp("comp-processor-0", "unit-0", "processor", "attached",
      infilled ? bar(0, 0, processorLength, processorDepth) : notchedBox(0, 0, processorLength, processorDepth),
      processorRule("service"), "TERMINAL", "terminal"));
    piers.forEach((pier, i) => {
      const u = (i - (piers.length - 1) / 2) * maxPitch + detailRng.float(-60, 60);
      const root = pier.detached ? processorDepth / 2 + 160 : processorDepth / 2;
      // Geometry follows the recorded ops: kink first (dogleg about the knee),
      // then skew (whole finger rotated about its root).
      const knee = pier.kink !== 0 ? detailRng.float(0.45, 0.65) : 1;
      let poly = pier.kink !== 0
        ? kinkedFinger(u, root, pier.length, pier.width, knee, pier.kink)
        : ccw([
          { u: u - pier.width / 2, v: root }, { u: u + pier.width / 2, v: root },
          { u: u + pier.width / 2, v: root + pier.length }, { u: u - pier.width / 2, v: root + pier.length },
        ]);
      if (pier.skew !== 0) poly = rotateAbout(poly, { u, v: root }, pier.skew);
      // Where the finger actually ends, after both ops — the cap must follow it.
      const tip = (() => {
        const kneeV = root + pier.length * knee;
        const rest = pier.length * (1 - knee);
        const raw = pier.kink !== 0
          ? { u: u + Math.sin(pier.kink) * rest, v: kneeV + Math.cos(pier.kink) * rest }
          : { u, v: root + pier.length };
        return pier.skew !== 0 ? rotateAbout([raw], { u, v: root }, pier.skew)[0]! : raw;
      })();
      const tipAngle = pier.kink + pier.skew;
      comps.push(makeComp(`comp-pier-${i}`, "unit-0", pier.detached ? "satellite" : "pier", pier.detached ? pier.connection : "attached", poly, pierRule(pier.gateClass), `CONCOURSE ${CONCOURSE_LETTERS[i]}`, "concourse"));
      if (pier.detached && pier.connection === "bridge") {
        comps.push(makeComp(`comp-connector-${i}`, "unit-0", "connector", "bridge", bar(u, processorDepth / 2 + 80, 45, 160), connectorRule, "", "concourse", true, true));
      }
      if (pier.cap !== "none") {
        const capPoly = pier.cap === "tee"
          ? rotateAbout(bar(tip.u, tip.v + 60, detailRng.float(320, 520), 120), tip, tipAngle)
          : bulge(tip.u - pier.width / 2, tip.u + pier.width / 2, tip.v, pier.cap === "rotunda" ? detailRng.float(110, 160) : detailRng.float(75, 110));
        comps.push(makeComp(`comp-cap-${i}`, "unit-0", "concourse", "attached", capPoly, serviceRule, `CONCOURSE ${CONCOURSE_LETTERS[i]}`, "concourse", true, true));
      }
    });
  } else if (family === "parallel" || family === "satellite") {
    const processorLength = dimsRng.float(900, 1500);
    const processorDepth = processorDepthFor(dimsRng.float(240, 340));
    addUnit(0, 0, "TERMINAL", processorLength, processorDepth);
    comps.push(makeComp("comp-processor-0", "unit-0", "processor", "attached", notchedBox(0, 0, processorLength, processorDepth), processorRule("service"), "TERMINAL", "terminal"));
    interface BarSpec { length: number; width: number; gateClass: AircraftClass }
    const barCount = family === "satellite" ? dimsRng.int(1, 2) : Math.max(2, Math.min(4, Math.round(program.gates / 40) + 1));
    const bars: BarSpec[] = Array.from({ length: barCount }, () => ({
      length: Math.min(3400, dimsRng.float(1800, 2600)),
      width: dimsRng.float(130, 190),
      gateClass: faceClass(dimsRng, program.mix),
    }));
    const ops = accretionRng.int(2, 4);
    for (let i = 0; i < ops; i++) {
      const roll = accretionRng.next();
      if (roll < 0.5 && bars.length > 0) {
        const idx = accretionRng.int(0, bars.length - 1);
        bars[idx]!.length = Math.min(3600, bars[idx]!.length * accretionRng.float(1.1, 1.3));
        accretion.push({ op: "lengthen", componentId: `comp-bar-${idx}`, cause: cause() });
      } else if (roll < 0.75 && family === "parallel") {
        bars.push({ length: dimsRng.float(1600, 2400), width: dimsRng.float(130, 190), gateClass: faceClass(accretionRng, program.mix) });
        accretion.push({ op: "add-pier", componentId: `comp-bar-${bars.length - 1}`, cause: cause() });
      } else {
        accretion.push({ op: "infill-processor", componentId: "comp-processor-0", cause: cause() });
      }
    }
    // Bar spacing derived from opposing stand depths + dual taxilane.
    let v = dimsRng.float(600, 800);
    bars.forEach((barSpec, i) => {
      const u = detailRng.float(-160, 160);
      comps.push(makeComp(`comp-bar-${i}`, "unit-0", "concourse", detailRng.chance(0.6) ? "tunnel" : "bridge", bar(u, v, barSpec.length, barSpec.width), horizontalBarRule(barSpec.gateClass), `CONCOURSE ${CONCOURSE_LETTERS[i]}`, "concourse"));
      const next = bars[i + 1];
      if (next) v += barSpec.width / 2 + DEPTH[barSpec.gateClass] + ALLEY + DEPTH[next.gateClass] + next.width / 2 + dimsRng.float(60, 160);
    });
    if (family === "satellite") {
      const podClass: AircraftClass = role === "mega-hub" ? "wide" : "narrow";
      const podCount = dimsRng.int(2, role === "regional" ? 2 : 4);
      const podPitch = dimsRng.float(950, 1250);
      const podV = v + dimsRng.float(700, 900);
      for (let i = 0; i < podCount; i++) {
        const u = (i - (podCount - 1) / 2) * podPitch;
        const size = dimsRng.float(280, 420);
        const half = size / 2;
        const poly = ccw([
          { u: u - half, v: podV - half * 0.55 }, { u: u - half * 0.55, v: podV - half }, { u: u + half * 0.55, v: podV - half },
          { u: u + half, v: podV - half * 0.55 }, { u: u + half, v: podV + half * 0.55 }, { u: u + half * 0.55, v: podV + half },
          { u: u - half * 0.55, v: podV + half }, { u: u - half, v: podV + half * 0.55 },
        ]);
        const connection = detailRng.pick(["bridge", "tunnel", "tunnel", "at-grade"] as const);
        comps.push(makeComp(`comp-pod-${i}`, "unit-0", "satellite", connection, poly, allGates(podClass), `CONCOURSE ${CONCOURSE_LETTERS[barCount + i]}`, "concourse", true, i > 0));
        if (connection === "bridge") {
          comps.push(makeComp(`comp-podlink-${i}`, "unit-0", "connector", "bridge", bar(u, podV - half - 120, 45, 240), connectorRule, "", "concourse", true, true));
        }
      }
    }
  } else if (family === "unit") {
    // Unit-terminal system (JFK/LAX): independent units spaced by the road court.
    const unitClass: AircraftClass = role === "mega-hub" ? "wide" : "narrow";
    const specs = Array.from({ length: program.unitCount }, (_, i) => ({
      processorLength: dimsRng.float(700, 1000),
      processorDepth: processorDepthFor(dimsRng.float(220, 300)),
      style: dimsRng.pick(["pier", "bar", "crescent"] as const),
      gateClass: faceClass(dimsRng, program.mix),
      index: i,
    }));
    const ops = accretionRng.int(2, 4);
    for (let i = 0; i < ops; i++) {
      const roll = accretionRng.next();
      if (roll < 0.4) {
        const idx = accretionRng.int(0, specs.length - 1);
        specs[idx]!.processorLength *= accretionRng.float(1.1, 1.25);
        accretion.push({ op: "lengthen", componentId: `comp-processor-${idx}`, cause: cause() });
      } else if (roll < 0.65 && specs.length < 6) {
        specs.push({ processorLength: dimsRng.float(650, 900), processorDepth: processorDepthFor(dimsRng.float(220, 280)), style: dimsRng.pick(["pier", "bar"] as const), gateClass: faceClass(accretionRng, program.mix), index: specs.length });
        accretion.push({ op: "add-unit", componentId: `comp-processor-${specs.length - 1}`, cause: cause() });
      } else {
        const idx = accretionRng.int(0, specs.length - 1);
        accretion.push({ op: "infill-processor", componentId: `comp-processor-${idx}`, cause: cause() });
      }
    }
    // Unit pitch bounded by the landside envelope: curb + court access margin.
    const maxCurb = Math.max(...specs.map((s) => s.processorLength * 1.25));
    const pitch = Math.max(dimsRng.float(1350, 1650), maxCurb + 220);
    const infilledIds = new Set(accretion.filter((op) => op.op === "infill-processor").map((op) => op.componentId));
    specs.forEach((spec, i) => {
      const u = (i - (specs.length - 1) / 2) * pitch;
      // Units on a real unit-terminal field (JFK, LAX) sit around a loop, each
      // set back by its own amount and turned to face its own piece of apron.
      // A perfect comb at one pitch on one line — every unit at v=0 — is the
      // single most artificial thing the old layout produced: the traced apron
      // came out as one straight ribbon instead of a ring.
      const setback = dimsRng.float(-260, 260);
      const turn = dimsRng.float(-0.3, 0.3);
      const place = (poly: UV[]): UV[] =>
        rotateAbout(poly.map((p) => ({ u: p.u, v: p.v + setback })), { u, v: setback }, turn);
      const unit = addUnit(i, u, `TERMINAL ${i + 1}`, spec.processorLength, spec.processorDepth);
      // The court moves with its unit, so landside stays landside after the turn.
      unit.court = place(unit.court);
      const poly = infilledIds.has(`comp-processor-${i}`) ? bar(u, 0, spec.processorLength, spec.processorDepth) : notchedBox(u, 0, spec.processorLength, spec.processorDepth);
      comps.push(makeComp(`comp-processor-${i}`, unit.id, "processor", "attached", place(poly), { ...processorRule(spec.style === "bar" ? "service" : "gate-face"), gateClass: spec.gateClass }, unit.name, "terminal"));
      if (spec.style === "pier") {
        const length = dimsRng.float(550, 850);
        comps.push(makeComp(`comp-unit-pier-${i}`, unit.id, "pier", "attached",
          place(ccw([{ u: u - 70, v: spec.processorDepth / 2 }, { u: u + 70, v: spec.processorDepth / 2 }, { u: u + 70, v: spec.processorDepth / 2 + length }, { u: u - 70, v: spec.processorDepth / 2 + length }])),
          pierRule(spec.gateClass), unit.name, "concourse", true, true));
      } else if (spec.style === "bar") {
        comps.push(makeComp(`comp-unit-bar-${i}`, unit.id, "concourse", "attached", place(bar(u, spec.processorDepth / 2 + 280, dimsRng.float(750, 1050), 150)), horizontalBarRule(spec.gateClass), unit.name, "concourse", true, true));
        comps.push(makeComp(`comp-unit-stem-${i}`, unit.id, "connector", "attached", place(bar(u, spec.processorDepth / 2 + 140, 90, 280)), connectorRule, "", "concourse", true, true));
      } else {
        comps.push(makeComp(`comp-unit-arc-${i}`, unit.id, "concourse", "attached", place(arcBand(u, spec.processorDepth / 2 + 120, dimsRng.float(700, 950), dimsRng.float(160, 250), dimsRng.float(100, 130))), crescentRule(spec.gateClass), unit.name, "concourse", true, true));
      }
    });
    // Road court spine: the loop/spine reservation that positions the units.
    const spineHalf = ((specs.length - 1) / 2) * pitch + maxCurb / 2 + 150;
    const maxDepth = Math.max(...specs.map((s) => s.processorDepth));
    roadCourts.push([
      { u: -spineHalf, v: -maxDepth / 2 - parkingDepth - 240 },
      { u: spineHalf, v: -maxDepth / 2 - parkingDepth - 240 },
      { u: spineHalf, v: -maxDepth / 2 - parkingDepth },
      { u: -spineHalf, v: -maxDepth / 2 - parkingDepth },
    ]);
  } else {
    // Curvilinear (DFW): shallow arcs strung along a spine, each its own unit,
    // with the road court inside each horseshoe.
    const specs = Array.from({ length: program.unitCount }, (_, i) => ({
      chord: dimsRng.float(950, 1300),
      sag: dimsRng.float(220, 330),
      width: dimsRng.float(100, 140),
      gateClass: faceClass(dimsRng, program.mix),
      index: i,
    }));
    const ops = accretionRng.int(2, 3);
    for (let i = 0; i < ops; i++) {
      if (accretionRng.chance(0.45) && specs.length < 6) {
        specs.push({ chord: dimsRng.float(900, 1200), sag: dimsRng.float(200, 300), width: dimsRng.float(100, 140), gateClass: faceClass(accretionRng, program.mix), index: specs.length });
        accretion.push({ op: "add-unit", componentId: `comp-arc-${specs.length - 1}`, cause: cause() });
      } else {
        const idx = accretionRng.int(0, specs.length - 1);
        specs[idx]!.chord *= accretionRng.float(1.08, 1.2);
        accretion.push({ op: "lengthen", componentId: `comp-arc-${idx}`, cause: cause() });
      }
    }
    const maxChord = Math.max(...specs.map((s) => s.chord));
    const pitch = maxChord + dimsRng.float(380, 550);
    specs.forEach((spec, i) => {
      const u = (i - (specs.length - 1) / 2) * pitch;
      const unit = addUnit(i, u, `TERMINAL ${String.fromCharCode(65 + i)}`, spec.chord * 0.8, 200);
      comps.push(makeComp(`comp-arc-${i}`, unit.id, "processor", "attached", arcBand(u, 0, spec.chord, spec.sag, spec.width), crescentRule(spec.gateClass), unit.name, "terminal"));
      // Road court: the lens inside the horseshoe between chord and inner arc.
      const h = spec.chord / 2;
      const R = (h * h + spec.sag * spec.sag) / (2 * spec.sag);
      const vc = spec.sag - R;
      const theta = Math.asin(h / R);
      const court: UV[] = [];
      const Ri = R - spec.width / 2 - 40;
      for (let k = 0; k <= 8; k++) {
        const a = -theta * 0.82 + (2 * theta * 0.82 * k) / 8;
        court.push({ u: u + Math.sin(a) * Ri, v: vc + Math.cos(a) * Ri });
      }
      roadCourts.push(ccw(court));
    });
  }

  // --- Stands on gate faces (validate footprint; drive the apron) ---
  const stands: Stand[] = [];
  const uvStands: { center: UV; facing: UV; cls: AircraftClass; pitch: number; depth: number; ownerId: string }[] = [];
  let gatesRemaining = program.gates * 1.15;
  for (const comp of comps) {
    for (const face of comp.faces) {
      if (face.role !== "gate-face" || !face.aircraftClass) continue;
      if (gatesRemaining <= 0) break;
      const cls = face.aircraftClass;
      const pitch = PITCH[cls];
      const faceLen = Math.hypot(face.b.u - face.a.u, face.b.v - face.a.v);
      const n = Math.min(Math.floor(faceLen / pitch), Math.ceil(gatesRemaining));
      const dir = { u: (face.b.u - face.a.u) / faceLen, v: (face.b.v - face.a.v) / faceLen };
      for (let i = 0; i < n; i++) {
        const along = (i + 0.5) * (faceLen / Math.max(1, n));
        const center = {
          u: face.a.u + dir.u * along + face.outward.u * DEPTH[cls] / 2,
          v: face.a.v + dir.v * along + face.outward.v * DEPTH[cls] / 2,
        };
        uvStands.push({ center, facing: { u: -face.outward.u, v: -face.outward.v }, cls, pitch, depth: DEPTH[cls], ownerId: comp.id });
      }
      gatesRemaining -= n;
    }
  }

  // --- Taxilanes and derived apron pieces ---
  const uvLanes: { id: string; ownerId: string; kind: Taxilane["kind"]; points: UV[]; width: number }[] = [];
  const apronPieces: { id: string; poly: UV[] }[] = [];
  let laneIndex = 0;

  for (const comp of comps) {
    for (const face of comp.faces) {
      if (face.role !== "gate-face" || !face.aircraftClass) continue;
      const cls = face.aircraftClass;
      const bandDepth = DEPTH[cls] + ALLEY;
      // Gate band: from the face out past the stand envelopes and their alley.
      apronPieces.push({
        id: `band-${comp.id}-${apronPieces.length}`,
        poly: [
          face.a, face.b,
          { u: face.b.u + face.outward.u * bandDepth, v: face.b.v + face.outward.v * bandDepth },
          { u: face.a.u + face.outward.u * bandDepth, v: face.a.v + face.outward.v * bandDepth },
        ],
      });
      // Alley behind the stand row.
      const off = DEPTH[cls] + ALLEY / 2;
      uvLanes.push({
        id: `lane-${laneIndex++}`, ownerId: comp.id, kind: "alley", width: ALLEY,
        points: [
          { u: face.a.u + face.outward.u * off, v: face.a.v + face.outward.v * off },
          { u: face.b.u + face.outward.u * off, v: face.b.v + face.outward.v * off },
        ],
      });
    }
  }

  // Extents from buildings and bands.
  // Margin exceeds the 250-ft alley-elbow extension so every elbow lands on the
  // collector span.
  const allUV = [...comps.flatMap((c) => c.poly), ...apronPieces.flatMap((p) => p.poly)];
  const uMin = Math.min(...allUV.map((p) => p.u)) - 320;
  const uMax = Math.max(...allUV.map((p) => p.u)) + 320;
  const vMax = Math.max(...allUV.map((p) => p.v));

  // Collector along the airside edge; every alley gets an elbow that reaches it.
  const vCollector = vMax + 60 + COLLECTOR_W / 2;
  const collector: UV[] = [{ u: uMin, v: vCollector }, { u: uMax, v: vCollector }];
  uvLanes.push({ id: `lane-${laneIndex++}`, ownerId: "airside", kind: "collector", points: collector, width: COLLECTOR_W });
  apronPieces.push({
    id: "band-collector",
    poly: [
      { u: uMin, v: vCollector - COLLECTOR_W / 2 }, { u: uMax, v: vCollector - COLLECTOR_W / 2 },
      { u: uMax, v: vCollector + COLLECTOR_W / 2 }, { u: uMin, v: vCollector + COLLECTOR_W / 2 },
    ],
  });
  for (const lane of uvLanes) {
    if (lane.kind !== "alley") continue;
    // Climb from the endpoint nearer the collector.
    if (Math.abs(lane.points[0]!.v - vCollector) < Math.abs(lane.points[lane.points.length - 1]!.v - vCollector)) {
      lane.points.reverse();
    }
    const start = lane.points[0]!;
    const end = lane.points[lane.points.length - 1]!;
    if (Math.abs(end.v - vCollector) < 1) continue;
    // Horizontal alleys first run 250 ft past the face end so the climb to the
    // collector rounds the building tip instead of crossing it.
    const horizontal = Math.abs(end.v - start.v) < Math.abs(end.u - start.u);
    if (horizontal) {
      const sign = Math.sign(end.u - start.u) || 1;
      lane.points.push({ u: end.u + sign * 250, v: end.v });
    }
    const turn = lane.points[lane.points.length - 1]!;
    lane.points.push({ u: turn.u, v: vCollector });
    // The elbow is pavement too.
    apronPieces.push({
      id: `band-elbow-${lane.id}`,
      poly: [
        { u: turn.u - lane.width / 2, v: Math.min(turn.v, vCollector) },
        { u: turn.u + lane.width / 2, v: Math.min(turn.v, vCollector) },
        { u: turn.u + lane.width / 2, v: vCollector },
        { u: turn.u - lane.width / 2, v: vCollector },
      ],
    });
  }

  // Root residual: pavement along processor airside faces between pier roots.
  for (const comp of comps) {
    if (comp.kind !== "processor") continue;
    for (const face of comp.faces) {
      if (face.role === "service" && face.outward.v > 0.7) {
        apronPieces.push({
          id: `band-root-${comp.id}`,
          poly: [face.a, face.b, { u: face.b.u, v: face.b.v + 180 }, { u: face.a.u, v: face.a.v + 180 }],
        });
      }
    }
  }

  // --- Interstitial infill ---
  // Gate bands alone leave grass slivers wherever two stand rows face each other
  // across an alley, or a finger stops short of the collector. Real terminal
  // aprons are a continuous field: taxiing aircraft need pavement everywhere the
  // fingers don't stand. These pieces overlap the bands in the same gray, so the
  // union renders as one field without any polygon boolean (decision 4).
  //
  // The airside half-plane starts at the frontmost landside court edge; nothing
  // below it may be paved, which is what keeps curbs and road courts clean.
  const courtVs = [...unitSpecs.map((u) => Math.max(...u.court.map((p) => p.v))), ...roadCourts.map((c) => Math.max(...c.map((p) => p.v)))];
  const vFloor = courtVs.length > 0 ? Math.max(...courtVs) : -Infinity;

  const fillers: UV[][] = [];
  // 1. Between adjacent fingers: the bay bounded by two neighbouring components,
  //    from the deeper root out to the collector.
  // Curvilinear units are processors rather than fingers, but a row of them
  // encloses the same kind of bay, so they count once there is more than one.
  const arcRow = comps.filter((c) => c.id.startsWith("comp-arc-"));
  const fingers = comps
    .filter((c) => (c.kind === "pier" || c.kind === "concourse" || c.kind === "satellite" || (arcRow.length > 1 && c.id.startsWith("comp-arc-"))) && c.poly.length > 0)
    .map((c) => ({
      id: c.id,
      uMin: Math.min(...c.poly.map((p) => p.u)), uMax: Math.max(...c.poly.map((p) => p.u)),
      vMin: Math.min(...c.poly.map((p) => p.v)), vMax: Math.max(...c.poly.map((p) => p.v)),
    }))
    .sort((a, b) => a.uMin - b.uMin);
  for (let i = 0; i + 1 < fingers.length; i++) {
    const a = fingers[i]!;
    const b = fingers[i + 1]!;
    const gap = b.uMin - a.uMax;
    // Only bays wide enough to be pavement rather than a construction joint, and
    // narrow enough that the space is genuinely enclosed by the two fingers.
    if (gap < 60 || gap > 2600) continue;
    const vLow = Math.max(Math.min(a.vMin, b.vMin), vFloor);
    const vHigh = Math.min(Math.max(a.vMax, b.vMax) + ALLEY, vCollector);
    if (vHigh - vLow < 80) continue;
    fillers.push([
      { u: a.uMax, v: vLow }, { u: b.uMin, v: vLow },
      { u: b.uMin, v: vHigh }, { u: a.uMax, v: vHigh },
    ]);
  }
  // 1b. Stacked bars (parallel/midfield family) run across u rather than out
  //     along v, so their bays are the v-gaps between successive bars — the RON
  //     ramps that fill an ATL midfield between concourse ranks.
  const stacked = fingers
    .filter((f) => f.uMax - f.uMin > f.vMax - f.vMin)
    .sort((a, b) => a.vMin - b.vMin);
  for (let i = 0; i + 1 < stacked.length; i++) {
    const a = stacked[i]!;
    const b = stacked[i + 1]!;
    const gap = b.vMin - a.vMax;
    if (gap < 60 || gap > 1400) continue;
    const left = Math.max(Math.min(a.uMin, b.uMin), uMin);
    const right = Math.min(Math.max(a.uMax, b.uMax), uMax);
    if (right - left < 80) continue;
    fillers.push([
      { u: left, v: Math.max(a.vMax, vFloor) }, { u: right, v: Math.max(a.vMax, vFloor) },
      { u: right, v: b.vMin }, { u: left, v: b.vMin },
    ]);
  }

  // 2. Finger tips to the collector: the turning area an aircraft needs to swing
  //    off the last stand and onto the collector.
  const vertical = fingers.filter((f) => f.vMax - f.vMin >= f.uMax - f.uMin);
  for (const finger of vertical) {
    if (vCollector - finger.vMax < 60) continue;
    fillers.push([
      { u: finger.uMin - ALLEY / 2, v: Math.max(finger.vMax, vFloor) },
      { u: finger.uMax + ALLEY / 2, v: Math.max(finger.vMax, vFloor) },
      { u: finger.uMax + ALLEY / 2, v: vCollector },
      { u: finger.uMin - ALLEY / 2, v: vCollector },
    ]);
  }
  // 3. Outboard aprons: the pavement beyond the outermost fingers, which is where
  //    RON and remain-overnight parking actually sits.
  if (vertical.length > 0) {
    const first = vertical[0]!;
    const last = vertical[vertical.length - 1]!;
    for (const [edge, dir] of [[first.uMin, -1], [last.uMax, 1]] as const) {
      const vLow = Math.max(Math.min(first.vMin, last.vMin), vFloor);
      if (vCollector - vLow < 80) continue;
      // Clamped to the collector span so the outboard apron never overhangs the
      // pavement the throats actually serve.
      const outer = Math.max(uMin, Math.min(uMax, edge + dir * 380));
      if (Math.abs(outer - edge) < 60) continue;
      fillers.push([
        { u: edge, v: vLow }, { u: outer, v: vLow },
        { u: outer, v: vCollector }, { u: edge, v: vCollector },
      ]);
    }
  }
  // Courts are no longer a single half-plane once units are turned to face their
  // own apron, so each filler is rejected outright if it reaches any court.
  // Fill is opportunistic — dropping a piece costs nothing, paving a curb is a
  // contract violation.
  const courts = [...unitSpecs.map((u) => u.court), ...roadCourts];
  const inPoly = (p: UV, poly: UV[]): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!;
      const b = poly[j]!;
      if ((a.v > p.v) !== (b.v > p.v) && p.u < ((b.u - a.u) * (p.v - a.v)) / (b.v - a.v) + a.u) inside = !inside;
    }
    return inside;
  };
  // True overlap, not bounding boxes: a turned unit's court sits diagonally
  // across the frame, and its box would veto legitimate bays beside it.
  const hitsCourt = (poly: UV[]): boolean =>
    courts.some((court) => {
      if (poly.some((p) => inPoly(p, court)) || court.some((p) => inPoly(p, poly))) return true;
      // Sampled interior points catch a filler that straddles a court without
      // either ring's vertices landing inside the other.
      for (let t = 0.2; t < 1; t += 0.2) {
        for (let s = 0.2; s < 1; s += 0.2) {
          const a = poly[0]!;
          const b = poly[1] ?? a;
          const c = poly[2] ?? a;
          const probe = { u: a.u + (b.u - a.u) * t + (c.u - b.u) * s, v: a.v + (b.v - a.v) * t + (c.v - b.v) * s };
          if (inPoly(probe, court)) return true;
        }
      }
      return false;
    });
  fillers
    .filter((poly) => !hitsCourt(poly))
    .forEach((poly, i) => apronPieces.push({ id: `band-fill-${i}`, poly: ccw(poly) }));

  const apronEdgeV = vCollector + COLLECTOR_W / 2;

  // Flared throats: stations along the collector, becoming stub taxiways upstream.
  const span = uMax - uMin;
  const throatCount = Math.max(2, Math.min(6, Math.round(span / 1400)));
  const throats: number[] = [];
  for (let i = 0; i < throatCount; i++) {
    const u = uMin + span * ((i + 0.5) / throatCount) + detailRng.float(-120, 120);
    throats.push(u);
    uvLanes.push({ id: `lane-${laneIndex++}`, ownerId: "airside", kind: "throat", points: [{ u, v: vCollector }, { u, v: apronEdgeV }], width: 120 });
  }

  // --- Silhouette articulation ---
  // Structural `poly` has done its work (roles, stands, bands); the drawn shape
  // now gains the small steps that separate a chart building from a box.
  // Connectors and caps stay clean — they are short, and real charts draw them
  // as simple stubs.
  for (const comp of comps) {
    const intensity = comp.kind === "connector" ? 0 : comp.kind === "processor" ? 0.85 : 0.6;
    comp.drawnPoly = articulatePolygon(comp.poly, detailRng, intensity);
  }

  // --- Assemble records (identity frame here; the district builder transforms) ---
  const toWorld = (p: UV): Point => at(p.u, p.v);
  // Everything drawn except non-bridge connectors (tunnels are not drawn at all).
  const buildings: Building[] = comps
    .filter((comp) => comp.drawn && !(comp.kind === "connector" && comp.connection !== "bridge"))
    .map((comp) => ({
      id: comp.id,
      kind: comp.buildingKind,
      label: comp.label,
      polygon: comp.drawnPoly.map(toWorld),
      unlabeled: comp.unlabeled,
    }));
  // The apron is published as the traced boundary of every purposeful piece,
  // not as the pieces themselves. Authoring stays per-purpose (each band still
  // records why it exists); the sheet gets the one articulated outline a real
  // chart draws. Reference median is 16 vertices — a rectangle per purpose is
  // what made these read as stacked slabs.
  // Simplification pulls the boundary in by up to `tolerance`, which can leave a
  // gate face a few feet outside its own pavement. Pieces are grown by that much
  // first so the traced edge lands outside every face it serves. Corners are
  // chamfered by varying amounts at the same time: pavement edges splay and cut
  // corners rather than turning square, and it is those cuts that give a real
  // apron its many edge directions (reference median 8 per piece; unchamfered
  // rectilinear pieces trace out at 2).
  const grown = apronPieces.map((piece) => {
    const ring = ccw(piece.poly);
    const out: UV[] = [];
    for (let i = 0; i < ring.length; i++) {
      const prev = ring[(i - 1 + ring.length) % ring.length]!;
      const cur = ring[i]!;
      const next = ring[(i + 1) % ring.length]!;
      // Offset along the two adjacent edge normals, not radially from the
      // centroid: a gate band is long and thin, and a radial push barely moves
      // its far ends outward — which left faces stranded just outside the
      // simplified boundary.
      const nA = outwardOf(prev, cur);
      const nB = outwardOf(cur, next);
      const nu = nA.u + nB.u;
      const nv = nA.v + nB.v;
      const nlen = Math.hypot(nu, nv) || 1;
      const push = { u: cur.u + (nu / nlen) * 34, v: cur.v + (nv / nlen) * 34 };
      const inA = Math.hypot(cur.u - prev.u, cur.v - prev.v);
      const inB = Math.hypot(next.u - cur.u, next.v - cur.v);
      const cut = Math.min(detailRng.float(40, 190), inA * 0.42, inB * 0.42);
      if (cut < 35) {
        out.push(push);
        continue;
      }
      out.push(
        { u: push.u - ((cur.u - prev.u) / inA) * cut, v: push.v - ((cur.v - prev.v) / inA) * cut },
        { u: push.u + ((next.u - cur.u) / inB) * cut, v: push.v + ((next.v - cur.v) / inB) * cut },
      );
    }
    return out.map((p) => at(p.u, p.v));
  });
  const traced = traceUnion(grown, { cell: 25, tolerance: 28, minArea: 12000 });
  const aprons: Apron[] = traced.map((polygon, i) => ({ id: `band-apron-${i}`, kind: "terminal" as const, polygon }));
  // RON ramp markers between parallel bars keep their labels.
  if (family === "parallel") {
    const barComps = comps.filter((c) => c.id.startsWith("comp-bar-"));
    for (let i = 0; i + 1 < barComps.length; i++) {
      const vMid = (Math.max(...barComps[i]!.poly.map((p) => p.v)) + Math.min(...barComps[i + 1]!.poly.map((p) => p.v))) / 2;
      aprons.push({ id: `ramp-${i + 1}`, kind: "ron", label: `RAMP ${i + 1}`, polygon: bar(0, vMid, 10, 10).map(toWorld) });
    }
  }

  const system: TerminalSystem = {
    units: unitSpecs.map((unit): TerminalUnit => ({
      id: unit.id, name: unit.name, curbLength: unit.curbLength, parkingDepth: unit.parkingDepth,
      landsideCourt: unit.court.map(toWorld),
    })),
    components: comps.map((comp) => ({
      id: comp.id, unitId: comp.unitId, kind: comp.kind, connection: comp.connection,
      polygon: comp.poly.map(toWorld),
      edges: comp.faces.map((face): ComponentEdge => ({ role: face.role, a: toWorld(face.a), b: toWorld(face.b), aircraftClass: face.aircraftClass })),
    })),
    roadCourts: roadCourts.map((court) => court.map(toWorld)),
    accretion,
    gatesPlanned: program.gates,
  };
  for (const s of uvStands) {
    const origin = at(0, 0);
    const dirU = at(1, 0);
    stands.push({
      id: `stand-${stands.length}`, ownerId: s.ownerId,
      center: toWorld(s.center),
      facing: (() => {
        const fx = (dirU.x - origin.x) * s.facing.u + (at(0, 1).x - origin.x) * s.facing.v;
        const fy = (dirU.y - origin.y) * s.facing.u + (at(0, 1).y - origin.y) * s.facing.v;
        const len = Math.hypot(fx, fy) || 1;
        return { x: fx / len, y: fy / len };
      })(),
      aircraftClass: s.cls, pitch: s.pitch, depth: s.depth,
    });
  }
  const taxilanes: Taxilane[] = uvLanes.map((lane) => ({
    id: lane.id, ownerId: lane.ownerId, kind: lane.kind, width: lane.width,
    points: lane.points.map(toWorld),
  }));

  return {
    family, buildings, aprons, throats, apronEdgeV, extentU: [uMin, uMax],
    system, stands, taxilanes,
  };
}
