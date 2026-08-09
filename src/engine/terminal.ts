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
  poly: UV[];
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
  return { id, unitId, kind, connection, poly, faces, drawn, label, buildingKind, unlabeled };
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
    const ops = accretionRng.int(2, 3);
    for (let i = 0; i < ops; i++) {
      if (accretionRng.chance(0.5)) {
        length *= accretionRng.float(1.12, 1.25);
        accretion.push({ op: "lengthen", componentId: "comp-processor-0", cause: cause() });
      } else {
        accretion.push({ op: "infill-processor", componentId: "comp-processor-0", cause: cause() });
      }
    }
    // A single linear frontage tops out around 2,400 ft; larger programs
    // degrade to fewer stands rather than an implausible mile-long bar.
    length = Math.min(length, 2400);
    const infilled = accretion.some((op) => op.op === "infill-processor");
    addUnit(0, 0, "TERMINAL", length, depth);
    const poly = infilled ? bar(0, 0, length, depth) : notchedBox(0, 0, length, depth);
    comps.push(makeComp("comp-processor-0", "unit-0", "processor", "attached", poly, { ...processorRule("gate-face"), gateClass }, "TERMINAL", "terminal"));
    if (detailRng.chance(0.35)) {
      const stubU = (detailRng.chance(0.5) ? 1 : -1) * length * 0.32;
      comps.push(makeComp("comp-concourse-0", "unit-0", "concourse", "attached", bar(stubU, depth / 2 + 200, 110, 400), pierRule(gateClass), "TERMINAL", "concourse", true, true));
    }
  } else if (family === "pier") {
    const hub = role.includes("hub");
    let processorLength = hub ? dimsRng.float(1100, 1700) : dimsRng.float(800, 1200);
    const processorDepth = processorDepthFor(dimsRng.float(200, 300));
    interface PierSpec { length: number; width: number; cap: "none" | "tee" | "pod" | "rotunda"; gateClass: AircraftClass; detached: boolean; connection: ComponentConnection }
    const pierCount = Math.max(1, Math.min(6, Math.round(program.gates / (hub ? 24 : 12))));
    const piers: PierSpec[] = Array.from({ length: pierCount }, (_, i) => ({
      length: (hub ? dimsRng.float(900, 1500) : dimsRng.float(650, 1050)) * (i % 2 ? 0.85 : 1),
      width: dimsRng.float(100, hub ? 160 : 130),
      cap: detailRng.pick(["none", "tee", "pod", "rotunda"] as const),
      gateClass: faceClass(dimsRng, program.mix),
      detached: false,
      connection: "attached",
    }));
    // Accretion: growth ops recorded with causes, giving earned irregularity.
    const ops = accretionRng.int(2, 4);
    for (let i = 0; i < ops; i++) {
      const roll = accretionRng.next();
      if (roll < 0.35 && piers.length > 0) {
        const idx = accretionRng.int(0, piers.length - 1);
        piers[idx]!.length *= accretionRng.float(1.15, 1.3);
        accretion.push({ op: "lengthen", componentId: `comp-pier-${idx}`, cause: cause() });
      } else if (roll < 0.55) {
        piers.push({
          length: dimsRng.float(700, 1200), width: dimsRng.float(100, 150),
          cap: "none", gateClass: faceClass(accretionRng, program.mix), detached: false, connection: "attached",
        });
        accretion.push({ op: "add-pier", componentId: `comp-pier-${piers.length - 1}`, cause: cause() });
      } else if (roll < 0.75) {
        const idx = accretionRng.int(0, piers.length - 1);
        piers[idx]!.cap = accretionRng.pick(["tee", "pod", "rotunda"] as const);
        accretion.push({ op: "cap-pier", componentId: `comp-pier-${idx}`, cause: cause() });
      } else if (roll < 0.9 && hub) {
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
      const poly = ccw([
        { u: u - pier.width / 2, v: root }, { u: u + pier.width / 2, v: root },
        { u: u + pier.width / 2, v: root + pier.length }, { u: u - pier.width / 2, v: root + pier.length },
      ]);
      comps.push(makeComp(`comp-pier-${i}`, "unit-0", pier.detached ? "satellite" : "pier", pier.detached ? pier.connection : "attached", poly, pierRule(pier.gateClass), `CONCOURSE ${CONCOURSE_LETTERS[i]}`, "concourse"));
      if (pier.detached && pier.connection === "bridge") {
        comps.push(makeComp(`comp-connector-${i}`, "unit-0", "connector", "bridge", bar(u, processorDepth / 2 + 80, 45, 160), connectorRule, "", "concourse", true, true));
      }
      if (pier.cap !== "none") {
        const capPoly = pier.cap === "tee" ? bar(u, root + pier.length + 60, detailRng.float(320, 520), 120) : bulge(u - pier.width / 2, u + pier.width / 2, root + pier.length, pier.cap === "rotunda" ? detailRng.float(110, 160) : detailRng.float(75, 110));
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
      const unit = addUnit(i, u, `TERMINAL ${i + 1}`, spec.processorLength, spec.processorDepth);
      const poly = infilledIds.has(`comp-processor-${i}`) ? bar(u, 0, spec.processorLength, spec.processorDepth) : notchedBox(u, 0, spec.processorLength, spec.processorDepth);
      comps.push(makeComp(`comp-processor-${i}`, unit.id, "processor", "attached", poly, { ...processorRule(spec.style === "bar" ? "service" : "gate-face"), gateClass: spec.gateClass }, unit.name, "terminal"));
      if (spec.style === "pier") {
        const length = dimsRng.float(550, 850);
        comps.push(makeComp(`comp-unit-pier-${i}`, unit.id, "pier", "attached",
          ccw([{ u: u - 70, v: spec.processorDepth / 2 }, { u: u + 70, v: spec.processorDepth / 2 }, { u: u + 70, v: spec.processorDepth / 2 + length }, { u: u - 70, v: spec.processorDepth / 2 + length }]),
          pierRule(spec.gateClass), unit.name, "concourse", true, true));
      } else if (spec.style === "bar") {
        comps.push(makeComp(`comp-unit-bar-${i}`, unit.id, "concourse", "attached", bar(u, spec.processorDepth / 2 + 280, dimsRng.float(750, 1050), 150), horizontalBarRule(spec.gateClass), unit.name, "concourse", true, true));
        comps.push(makeComp(`comp-unit-stem-${i}`, unit.id, "connector", "attached", bar(u, spec.processorDepth / 2 + 140, 90, 280), connectorRule, "", "concourse", true, true));
      } else {
        comps.push(makeComp(`comp-unit-arc-${i}`, unit.id, "concourse", "attached", arcBand(u, spec.processorDepth / 2 + 120, dimsRng.float(700, 950), dimsRng.float(160, 250), dimsRng.float(100, 130)), crescentRule(spec.gateClass), unit.name, "concourse", true, true));
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

  // --- Assemble records (identity frame here; the district builder transforms) ---
  const toWorld = (p: UV): Point => at(p.u, p.v);
  // Everything drawn except non-bridge connectors (tunnels are not drawn at all).
  const buildings: Building[] = comps
    .filter((comp) => comp.drawn && !(comp.kind === "connector" && comp.connection !== "bridge"))
    .map((comp) => ({
      id: comp.id,
      kind: comp.buildingKind,
      label: comp.label,
      polygon: comp.poly.map(toWorld),
      unlabeled: comp.unlabeled,
    }));
  const aprons: Apron[] = apronPieces.map((piece) => ({ id: piece.id, kind: "terminal" as const, polygon: piece.poly.map(toWorld) }));
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
