import { traceUnion } from "./outline";
import type { RNG } from "./rng";
import type { AccretionOp, AircraftClass, Apron, Building, ComponentConnection, ComponentEdge, EdgeRole, Point, Role, Stand, Taxilane, TerminalArchetype, TerminalComponent, TerminalForm, TerminalLink, TerminalSystem, TerminalUnit } from "./types";

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
 * Convex side faces +v (airside).
 *
 * `wobble` breaks the perfect circle. A crescent terminal is built in phases
 * against a curved road, not struck with a compass: real ones (DFW, CDG) run
 * slightly tighter at one end, flatten in the middle, and vary in depth. A
 * mathematically exact arc is the tell that gave these away as drafted. */
function arcBand(u0: number, v0: number, chord: number, sag: number, width: number, wobble?: (t: number) => { radius: number; width: number }): UV[] {
  const h = chord / 2;
  const R = (h * h + sag * sag) / (2 * sag);
  const vc = v0 + sag - R;
  const theta = Math.asin(h / R);
  const points: UV[] = [];
  const steps = 14;
  const at = (i: number) => {
    const t = i / steps;
    const a = -theta + 2 * theta * t;
    const w = wobble?.(t) ?? { radius: 0, width: 0 };
    return { a, R: R + w.radius, half: (width + w.width) / 2 };
  };
  for (let i = 0; i <= steps; i++) {
    const { a, R: r, half } = at(i);
    points.push({ u: u0 + Math.sin(a) * (r + half), v: vc + Math.cos(a) * (r + half) });
  }
  for (let i = steps; i >= 0; i--) {
    const { a, R: r, half } = at(i);
    points.push({ u: u0 + Math.sin(a) * (r - half), v: vc + Math.cos(a) * (r - half) });
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

/** Gate capacity of one terminal in a given form. The upper bound is what makes
 * demand spill into a second terminal rather than growing one implausibly. */
const FORM_CAPACITY: Record<TerminalForm, [number, number]> = {
  bar: [4, 26],
  finger: [10, 70],
  crescent: [12, 44],
  block: [16, 60],
  satellite: [20, 80],
};

/** Which forms a role would plausibly build. A basic GA field never builds a
 * satellite; a mega-hub rarely builds a lone bar. */
function formsFor(role: Role): readonly (readonly [TerminalForm, number])[] {
  if (role === "business-ga" || role === "basic-ga") return [["bar", 1]] as const;
  if (role === "regional") return [["bar", 0.55], ["finger", 0.35], ["crescent", 0.1]] as const;
  if (role === "mid-hub") return [["finger", 0.4], ["bar", 0.2], ["crescent", 0.25], ["block", 0.15]] as const;
  return [["finger", 0.34], ["crescent", 0.22], ["block", 0.24], ["satellite", 0.2]] as const;
}

/** The field-scale archetype still names the layout for the model summary and
 * the UI, so a per-terminal build reports the family its forms add up to. */
function archetypeOf(forms: TerminalForm[], prior: TerminalArchetype): TerminalArchetype {
  if (forms.length === 0) return "none";
  const nameOf = (form: TerminalForm): TerminalArchetype =>
    form === "bar" ? "linear" : form === "crescent" ? "semicircle" : form === "satellite" ? "satellite" : form === "block" ? "unit" : "pier";
  if (forms.length === 1) return nameOf(forms[0]!);
  // Several terminals. The field is named for the form that dominates it, not
  // simply "unit" — reporting every multi-terminal field as a unit system made
  // one archetype swallow 83% of the hub population once terminals stopped
  // being capped at two.
  if (prior === "parallel") return "parallel";
  // An explicitly requested archetype is honoured as long as the field still
  // contains a terminal of that form: the caller asked for a satellite field
  // and got one, even though a sibling terminal took a different form.
  if (prior !== "none" && forms.some((form) => nameOf(form) === prior)) return prior;
  const tally = new Map<TerminalForm, number>();
  for (const form of forms) tally.set(form, (tally.get(form) ?? 0) + 1);
  const [top, topCount] = [...tally].sort((a, b) => b[1] - a[1])[0]!;
  // A genuinely mixed estate (no form more than half) is what "unit" describes:
  // independent terminals of differing kinds sharing one landside.
  return topCount > forms.length / 2 ? nameOf(top) : "unit";
}

/** Pick each terminal's form from unmet gate demand.
 *
 * The field's gate program is a budget. The first terminal takes a share; if
 * gates remain unserved, a second is added — weighted toward the same form, so
 * a field usually reads as a coherent estate with one odd sibling, the way real
 * airports do. Two is the cap: beyond that the sheet stops reading as a place
 * and starts reading as a catalogue. */
function planTerminals(role: Role, prior: TerminalArchetype, gates: number, rng: RNG): { form: TerminalForm; gates: number }[] {
  const options = formsFor(role);
  // A caller-supplied archetype biases the first terminal's form toward the
  // nearest terminal-scale equivalent.
  const priorForm: TerminalForm | null =
    prior === "linear" ? "bar" : prior === "pier" || prior === "parallel" ? "finger" :
    prior === "semicircle" ? "crescent" : prior === "unit" ? "block" : prior === "satellite" ? "satellite" : null;
  const first = priorForm && options.some(([f]) => f === priorForm) ? priorForm : rng.weighted(options);
  const [, firstMax] = FORM_CAPACITY[first];
  const firstGates = Math.min(gates, Math.max(FORM_CAPACITY[first][0], Math.round(firstMax * rng.float(0.55, 1))));
  const plan = [{ form: first, gates: firstGates }];
  // Keep spending the gate budget. The big roles genuinely run estates of four
  // or five terminals (JFK, LAX, ORD); capping every field at two was making
  // majors and megas read as undersized. Smaller roles still top out at two.
  const maxTerminals = role === "mega-hub" ? 5 : role === "major-hub" ? 4 : role === "mid-hub" ? 3 : 2;
  let remaining = gates - firstGates;
  while (remaining >= 8 && plan.length < maxTerminals) {
    // Slight weight toward matching a sibling, so a field reads as one estate
    // with variety rather than a catalogue of every form.
    const next = rng.chance(0.45) ? rng.pick(plan).form : rng.weighted(options);
    const take = Math.min(remaining, Math.max(FORM_CAPACITY[next][0], Math.round(FORM_CAPACITY[next][1] * rng.float(0.5, 1))));
    plan.push({ form: next, gates: take });
    remaining -= take;
  }
  return plan;
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

  const program = programFor(role, archetypePrior, programRng);

  const comps: Comp[] = [];
  const roadCourts: UV[][] = [];
  const accretion: AccretionOp[] = [];
  const cause = (): string => accretionRng.pick([
    "gate demand growth", "widebody bank added", "phased construction", "landside constraint", "alliance consolidation",
  ]);

  // Landside envelope numbers bound processor depth and unit spacing (2.5 driver).
  const parkingDepth = dimsRng.float(300, 600);
  const processorDepthFor = (drawn: number): number => Math.min(drawn, Math.max(190, parkingDepth * 0.75));

  interface UnitSpec { id: string; name: string; curbLength: number; parkingDepth: number; court: UV[]; form: TerminalForm; gates: number }
  const unitSpecs: UnitSpec[] = [];

  const addUnit = (unitIndex: number, u0: number, name: string, processorLength: number, processorDepth: number, form: TerminalForm, gates: number): UnitSpec => {
    const curbLength = processorLength * dimsRng.float(1, 1.25);
    const unit: UnitSpec = {
      id: `unit-${unitIndex}`,
      name,
      curbLength,
      parkingDepth,
      form,
      gates,
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

  // --- Per-terminal build ---
  // Each terminal is planned and built independently from its own form and its
  // own share of the gate budget, then placed. A field-wide archetype produced
  // clones on a line (measured centroid spread 0.14 against JFK's 0.33); mixing
  // forms and placing each terminal on its own frontage is what real estates do.

  const plan = planTerminals(role, archetypePrior, program.gates, programRng.derive("forms"));
  const family = archetypeOf(plan.map((p) => p.form), archetypePrior);

  /** Where a terminal sits and which way it faces. */
  interface Placement { u: number; v: number; turn: number }

  // Concourse letters run across the whole field, so no two concourses on the
  // sheet share a letter regardless of which terminal they belong to.
  let concourseSeq = 0;

  const placeFn = (placement: Placement) => (poly: UV[]): UV[] =>
    rotateAbout(poly.map((p) => ({ u: p.u + placement.u, v: p.v + placement.v })), { u: placement.u, v: placement.v }, placement.turn);

  /** Build one terminal in its own local frame, then place it. Returns the
   * airside reach so siblings can be spaced off it. */
  const buildOne = (index: number, form: TerminalForm, gates: number, placement: Placement): { reach: number; halfWidth: number } => {
    const place = placeFn(placement);
    const gateClass = faceClass(dimsRng, program.mix);
    const pitch = PITCH[gateClass];
    const unitId = `unit-${index}`;
    const name = plan.length > 1 ? `TERMINAL ${index + 1}` : "TERMINAL";
    // Only the processor is the terminal. Piers, arms and pods are concourses
    // and are lettered as such — labelling every mass "TERMINAL" was reading as
    // a field with four terminals when it has one terminal and three concourses.
    const concourseName = (): string => `CONCOURSE ${CONCOURSE_LETTERS[concourseSeq++] ?? "X"}`;
    const ops = accretionRng.int(1, 2);
    let reach = 0;
    let halfWidth = 0;

    if (form === "bar") {
      // A single frontage, straight or bent where a later phase followed the
      // apron edge rather than the original axis.
      let length = Math.max(700, gates * pitch * dimsRng.float(1, 1.15));
      const depth = processorDepthFor(dimsRng.float(180, 270));
      let bend = 0;
      for (let i = 0; i < ops; i++) {
        const roll = accretionRng.next();
        if (roll < 0.4) {
          length *= accretionRng.float(1.1, 1.22);
          accretion.push({ op: "lengthen", componentId: `comp-processor-${index}`, cause: cause() });
        } else if (roll < 0.72 && bend === 0) {
          bend = accretionRng.float(0.1, 0.22) * (accretionRng.chance(0.5) ? 1 : -1);
          accretion.push({ op: "kink", componentId: `comp-processor-${index}`, cause: cause() });
        } else {
          accretion.push({ op: "infill-processor", componentId: `comp-processor-${index}`, cause: cause() });
        }
      }
      length = Math.min(length, 2400);
      const unit = addUnit(index, 0, name, length, depth, form, gates);
      unit.court = place(unit.court);
      const poly = bend !== 0 ? bentBar(length, depth, bend) : notchedBox(0, 0, length, depth);
      comps.push(makeComp(`comp-processor-${index}`, unitId, "processor", "attached", place(poly), { ...processorRule("gate-face"), gateClass }, name, "terminal"));
      reach = depth / 2;
      halfWidth = length / 2;
    } else if (form === "finger") {
      // A processor with one to three piers; the workhorse hub terminal.
      const processorLength = dimsRng.float(750, 1350);
      const processorDepth = processorDepthFor(dimsRng.float(200, 300));
      interface PierSpec { length: number; width: number; cap: "none" | "tee" | "pod" | "rotunda"; gateClass: AircraftClass; skew: number; kink: number }
      const pierCount = Math.max(1, Math.min(3, Math.round(gates / 22)));
      const piers: PierSpec[] = Array.from({ length: pierCount }, (_, i) => ({
        length: dimsRng.float(700, 1250) * (i % 2 ? 0.85 : 1),
        width: dimsRng.float(100, 155),
        cap: detailRng.pick(["none", "none", "tee", "pod", "rotunda"] as const),
        gateClass: faceClass(dimsRng, program.mix),
        skew: 0,
        kink: 0,
      }));
      for (let i = 0; i < ops; i++) {
        const roll = accretionRng.next();
        const idx = accretionRng.int(0, piers.length - 1);
        if (roll < 0.3) {
          piers[idx]!.length *= accretionRng.float(1.12, 1.28);
          accretion.push({ op: "lengthen", componentId: `comp-pier-${index}-${idx}`, cause: cause() });
        } else if (roll < 0.55) {
          piers[idx]!.skew = accretionRng.float(0.1, 0.26) * (accretionRng.chance(0.5) ? 1 : -1);
          accretion.push({ op: "skew", componentId: `comp-pier-${index}-${idx}`, cause: cause() });
        } else if (roll < 0.78) {
          piers[idx]!.kink = accretionRng.float(0.14, 0.32) * (accretionRng.chance(0.5) ? 1 : -1);
          accretion.push({ op: "kink", componentId: `comp-pier-${index}-${idx}`, cause: cause() });
        } else {
          piers[idx]!.cap = accretionRng.pick(["tee", "pod", "rotunda"] as const);
          accretion.push({ op: "cap-pier", componentId: `comp-pier-${index}-${idx}`, cause: cause() });
        }
      }
      const pierNames = piers.map(() => concourseName());
      const pitches = piers.map((p) => p.width + 2 * DEPTH[p.gateClass] + ALLEY);
      const maxPitch = Math.max(...pitches);
      const spanned = Math.max(processorLength, piers.length * maxPitch * 0.9);
      const unit = addUnit(index, 0, name, spanned, processorDepth, form, gates);
      unit.court = place(unit.court);
      comps.push(makeComp(`comp-processor-${index}`, unitId, "processor", "attached",
        place(notchedBox(0, 0, spanned, processorDepth)), processorRule("service"), name, "terminal"));
      piers.forEach((pier, i) => {
        const u = (i - (piers.length - 1) / 2) * maxPitch + detailRng.float(-50, 50);
        const root = processorDepth / 2;
        const knee = pier.kink !== 0 ? detailRng.float(0.45, 0.65) : 1;
        let poly = pier.kink !== 0
          ? kinkedFinger(u, root, pier.length, pier.width, knee, pier.kink)
          : ccw([
            { u: u - pier.width / 2, v: root }, { u: u + pier.width / 2, v: root },
            { u: u + pier.width / 2, v: root + pier.length }, { u: u - pier.width / 2, v: root + pier.length },
          ]);
        if (pier.skew !== 0) poly = rotateAbout(poly, { u, v: root }, pier.skew);
        const tip = (() => {
          const kneeV = root + pier.length * knee;
          const rest = pier.length * (1 - knee);
          const raw = pier.kink !== 0
            ? { u: u + Math.sin(pier.kink) * rest, v: kneeV + Math.cos(pier.kink) * rest }
            : { u, v: root + pier.length };
          return pier.skew !== 0 ? rotateAbout([raw], { u, v: root }, pier.skew)[0]! : raw;
        })();
        comps.push(makeComp(`comp-pier-${index}-${i}`, unitId, "pier", "attached", place(poly), pierRule(pier.gateClass), pierNames[i]!, "concourse", true, false));
        if (pier.cap !== "none") {
          const capPoly = pier.cap === "tee"
            ? rotateAbout(bar(tip.u, tip.v + 60, detailRng.float(300, 480), 120), tip, pier.kink + pier.skew)
            : bulge(tip.u - pier.width / 2, tip.u + pier.width / 2, tip.v, pier.cap === "rotunda" ? detailRng.float(110, 155) : detailRng.float(75, 110));
          comps.push(makeComp(`comp-cap-${index}-${i}`, unitId, "concourse", "attached", place(capPoly), serviceRule, pierNames[i]!, "concourse", true, true));
        }
      });
      reach = processorDepth / 2 + Math.max(...piers.map((p) => p.length)) + 120;
      halfWidth = spanned / 2;
    } else if (form === "crescent") {
      // Curved frontage with the road court inside the horseshoe (DFW).
      let chord = Math.max(800, gates * pitch * dimsRng.float(0.5, 0.7));
      const sag = dimsRng.float(220, 340);
      const width = dimsRng.float(100, 145);
      for (let i = 0; i < ops; i++) {
        chord *= accretionRng.float(1.06, 1.18);
        accretion.push({ op: "lengthen", componentId: `comp-processor-${index}`, cause: cause() });
      }
      chord = Math.min(chord, 1500);
      const unit = addUnit(index, 0, name, chord * 0.8, 200, form, gates);
      unit.court = place(unit.court);
      // Phase joints, not a compass sweep: the arc tightens toward one end and
      // its depth swells where a concourse was widened.
      const tighten = dimsRng.float(-0.22, 0.22);
      const swellAt = dimsRng.float(0.25, 0.75);
      const swell = dimsRng.float(0.15, 0.5);
      const flat = dimsRng.float(0.06, 0.18);
      const wobble = (t: number) => ({
        // Radius drifts linearly end-to-end, plus a gentle mid-span flattening.
        radius: sag * (tighten * (t - 0.5) * 2 + flat * Math.sin(Math.PI * t)),
        width: width * swell * Math.exp(-(((t - swellAt) / 0.22) ** 2)),
      });
      comps.push(makeComp(`comp-processor-${index}`, unitId, "processor", "attached",
        place(arcBand(0, 0, chord, sag, width, wobble)), crescentRule(gateClass), name, "terminal"));
      // The lens inside the horseshoe is roadway, never apron.
      const h = chord / 2;
      const R = (h * h + sag * sag) / (2 * sag);
      const vc = sag - R;
      const theta = Math.asin(h / R);
      const court: UV[] = [];
      // Clearance covers the wobble's deepest inward excursion, so a tightened
      // or swollen arc still never sits on its own roadway.
      const inward = sag * (Math.abs(tighten) + flat) + width * swell * 0.5;
      const Ri = R - width / 2 - 40 - inward;
      for (let k = 0; k <= 8; k++) {
        const a = -theta * 0.82 + (2 * theta * 0.82 * k) / 8;
        court.push({ u: Math.sin(a) * Ri, v: vc + Math.cos(a) * Ri });
      }
      roadCourts.push(place(ccw(court)));
      reach = sag + width / 2;
      halfWidth = chord / 2;
    } else if (form === "block") {
      // A chunky processor with short arms — the compact unit terminal that
      // gives a ring its mass (JFK aspect ratios measured at 1.5-2.1).
      const blockLength = dimsRng.float(600, 950);
      const blockDepth = processorDepthFor(dimsRng.float(340, 520));
      for (let i = 0; i < ops; i++) {
        accretion.push({ op: accretionRng.chance(0.5) ? "infill-processor" : "lengthen", componentId: `comp-processor-${index}`, cause: cause() });
      }
      const unit = addUnit(index, 0, name, blockLength, blockDepth, form, gates);
      unit.court = place(unit.court);
      comps.push(makeComp(`comp-processor-${index}`, unitId, "processor", "attached",
        place(notchedBox(0, 0, blockLength, blockDepth)), { ...processorRule("gate-face"), gateClass }, name, "terminal"));
      // Short arms off both ends, angled outward, enclosing the ramp. Both arms
      // are one concourse — they are two ends of the same airside structure.
      const armName = concourseName();
      const armLength = dimsRng.float(280, 520);
      for (const side of [-1, 1] as const) {
        const armU = side * (blockLength / 2 - 60);
        const arm = rotateAbout(
          ccw([
            { u: armU - 65, v: blockDepth / 2 }, { u: armU + 65, v: blockDepth / 2 },
            { u: armU + 65, v: blockDepth / 2 + armLength }, { u: armU - 65, v: blockDepth / 2 + armLength },
          ]),
          { u: armU, v: blockDepth / 2 },
          side * dimsRng.float(0.15, 0.45),
        );
        comps.push(makeComp(`comp-arm-${index}-${side > 0 ? "r" : "l"}`, unitId, "pier", "attached", place(arm), pierRule(gateClass), armName, "concourse", true, side < 0));
      }
      reach = blockDepth / 2 + armLength;
      halfWidth = blockLength / 2 + 200;
    } else {
      // Satellite: a processor with a detached pod reached by a link. The
      // processor grows with the programme too — a big satellite hanging off a
      // fixed-size stub was what made these read as all pod and no terminal.
      const processorLength = Math.max(700, Math.min(1600, gates * 16 * dimsRng.float(0.9, 1.15)));
      const processorDepth = processorDepthFor(dimsRng.float(220, 320));
      const gap = dimsRng.float(650, 1000);
      const podClass: AircraftClass = role === "mega-hub" ? "wide" : "narrow";
      // Sized from gate demand, but bounded: the pod is an octagon whose 8 faces
      // each run about 0.45 of its width, so a face shorter than one stand pitch
      // parks nothing (a fixed 320-480 ft pod silently produced zero stands for
      // wide-body pods at 230 ft pitch). Demand alone runs away though — 68
      // gates asked for a 5,100 ft pod against an 850 ft processor, six times
      // its parent and wider than the runways. A satellite is a remote pier,
      // not a second airport: it stays within about 1.6x its processor, and
      // gates beyond that capacity are simply not served here.
      const demandSize = (gates * PITCH[podClass]) / (8 * 0.45) * dimsRng.float(1, 1.15);
      const podSize = Math.max(PITCH[podClass] * 2.6, Math.min(demandSize, processorLength * 1.6, 1100));
      for (let i = 0; i < ops; i++) {
        accretion.push({ op: "detach-satellite", componentId: `comp-pod-${index}`, cause: cause() });
      }
      const unit = addUnit(index, 0, name, processorLength, processorDepth, form, gates);
      unit.court = place(unit.court);
      comps.push(makeComp(`comp-processor-${index}`, unitId, "processor", "attached",
        place(notchedBox(0, 0, processorLength, processorDepth)), processorRule("service"), name, "terminal"));
      const podV = processorDepth / 2 + gap + podSize / 2;
      const half = podSize / 2;
      const pod = ccw([
        { u: -half, v: podV - half * 0.55 }, { u: -half * 0.55, v: podV - half }, { u: half * 0.55, v: podV - half },
        { u: half, v: podV - half * 0.55 }, { u: half, v: podV + half * 0.55 }, { u: half * 0.55, v: podV + half },
        { u: -half * 0.55, v: podV + half }, { u: -half, v: podV + half * 0.55 },
      ]);
      const connection = detailRng.pick(["bridge", "tunnel", "tunnel", "at-grade"] as const);
      comps.push(makeComp(`comp-pod-${index}`, unitId, "satellite", connection, place(pod), allGates(podClass), concourseName(), "concourse", true, false));
      if (connection === "bridge") {
        comps.push(makeComp(`comp-podlink-${index}`, unitId, "connector", "bridge",
          place(bar(0, processorDepth / 2 + gap / 2, 45, gap)), connectorRule, "", "concourse", true, true));
      }
      reach = podV + half;
      halfWidth = Math.max(processorLength, podSize) / 2;
    }
    return { reach, halfWidth };
  };

  // Terminals are laid out along a shared landside frontage, alternating sides
  // of the first so the estate grows outward in both directions rather than
  // marching off in one. Each shares a land-facing radius — a modest setback,
  // not a free offset — and is turned *away* from the field centre, so the
  // group splays open around its landside the way a real estate does. Turning
  // inward would aim neighbouring gate frontages at each other and close off
  // the ramp between them.
  const placements: Placement[] = [{ u: 0, v: 0, turn: 0 }];
  const built = [buildOne(0, plan[0]!.form, plan[0]!.gates, placements[0]!)];
  let reachRight = built[0]!.halfWidth;
  let reachLeft = -built[0]!.halfWidth;
  for (let i = 1; i < plan.length; i++) {
    // Alternate sides: 1 right, 2 left, 3 right...
    const side = i % 2 === 1 ? 1 : -1;
    const from = side > 0 ? reachRight : reachLeft;
    const u = from + side * dimsRng.float(520, 950);
    const placement: Placement = {
      u,
      v: dimsRng.float(-180, 180),
      turn: -side * dimsRng.float(0.05, 0.3),
    };
    placements.push(placement);
    const result = buildOne(i, plan[i]!.form, plan[i]!.gates, placement);
    built.push(result);
    if (side > 0) reachRight = u + result.halfWidth;
    else reachLeft = u - result.halfWidth;
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
  const segmentsCross = (p1: UV, p2: UV, p3: UV, p4: UV): boolean => {
    const d = (p2.u - p1.u) * (p4.v - p3.v) - (p2.v - p1.v) * (p4.u - p3.u);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((p3.u - p1.u) * (p4.v - p3.v) - (p3.v - p1.v) * (p4.u - p3.u)) / d;
    const s = ((p3.u - p1.u) * (p2.v - p1.v) - (p3.v - p1.v) * (p2.u - p1.u)) / d;
    return t > 0 && t < 1 && s > 0 && s < 1;
  };
  const hitsCourt = (poly: UV[]): boolean =>
    courts.some((court) => {
      if (poly.some((p) => inPoly(p, court)) || court.some((p) => inPoly(p, poly))) return true;
      // Crossing edges catch a piece that straddles a court without either
      // ring's vertices landing inside the other — the collector ribbon
      // sweeping across a turned terminal's curb is exactly this case.
      for (let i = 0; i < poly.length; i++) {
        for (let j = 0; j < court.length; j++) {
          if (segmentsCross(poly[i]!, poly[(i + 1) % poly.length]!, court[j]!, court[(j + 1) % court.length]!)) return true;
        }
      }
      return false;
    });
  fillers
    .filter((poly) => !hitsCourt(poly))
    .forEach((poly, i) => apronPieces.push({ id: `band-fill-${i}`, poly: ccw(poly) }));

  /** Clip a polygon back out of a convex court, keeping it whole.
   *
   * Bands and the collector cannot simply be dropped when they reach a court —
   * a gate face without pavement is a worse defect than a short band — so they
   * are cut against the court edge they least overrun. Applied *after* the
   * outward grow and chamfer, because those push the boundary back over a curb
   * that was clear before them. */
  const clipOutOfCourts = (poly: UV[], margin: number): UV[] => {
    let result = poly;
    for (const court of courts) {
      if (!hitsCourt(result)) break;
      const cu = court.reduce((s, p) => s + p.u, 0) / court.length;
      const cv = court.reduce((s, p) => s + p.v, 0) / court.length;
      let bestEdge: { n: UV; d: number; kept: number } | null = null;
      for (let j = 0; j < court.length; j++) {
        const a = court[j]!;
        const b = court[(j + 1) % court.length]!;
        const len = Math.hypot(b.u - a.u, b.v - a.v) || 1;
        let n = { u: (b.v - a.v) / len, v: -(b.u - a.u) / len };
        if ((a.u - cu) * n.u + (a.v - cv) * n.v < 0) n = { u: -n.u, v: -n.v };
        const d = a.u * n.u + a.v * n.v + margin;
        const kept = result.filter((p) => p.u * n.u + p.v * n.v >= d).length;
        if (kept >= 3 && (!bestEdge || kept > bestEdge.kept)) bestEdge = { n, d, kept };
      }
      if (!bestEdge) continue;
      const { n, d } = bestEdge;
      const clipped: UV[] = [];
      for (let j = 0; j < result.length; j++) {
        const a = result[j]!;
        const b = result[(j + 1) % result.length]!;
        const da = a.u * n.u + a.v * n.v - d;
        const db = b.u * n.u + b.v * n.v - d;
        if (da >= 0) clipped.push(a);
        if ((da >= 0) !== (db >= 0)) {
          const t = da / (da - db);
          clipped.push({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
        }
      }
      if (clipped.length >= 3) result = clipped;
    }
    return result;
  };

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
    // Clipped after growing: the outward push and chamfer would otherwise put
    // the boundary back over a curb the raw piece had cleared.
    return clipOutOfCourts(out, 30).map((p) => at(p.u, p.v));
  });
  const traced = traceUnion(grown, { cell: 25, tolerance: 28, minArea: 12000 });
  const aprons: Apron[] = traced.map((polygon, i) => ({ id: `band-apron-${i}`, kind: "terminal" as const, polygon }));
  // --- Linking sibling terminals ---
  // Two terminals that grew close enough get joined by structure; too far apart
  // and they simply stay separate, which is itself a common real arrangement.
  // The link runs between the nearest points of the two processors, offset to
  // the landside so it never crosses the gate faces or the stand rows it would
  // otherwise block. The caller vetoes links that would cross a runway — that
  // check needs the world frame and the runway set, which live in the generator.
  const links: TerminalLink[] = [];
  const processorOf = (unitId: string) => comps.find((c) => c.unitId === unitId && c.kind === "processor");
  // Order units by position so links join actual neighbours, not across the field.
  const ordered = unitSpecs
    .map((unit, i) => ({ unit, u: placements[i]?.u ?? 0 }))
    .sort((x, y) => x.u - y.u)
    .map((x) => x.unit);
  for (let i = 0; i + 1 < ordered.length; i++) {
    const a = processorOf(ordered[i]!.id);
    const b = processorOf(ordered[i + 1]!.id);
    if (!a || !b) continue;
    // Nearest vertex pair between the two masses.
    let best: { from: UV; to: UV; d: number } | null = null;
    for (const p of a.poly) {
      for (const q of b.poly) {
        const d = Math.hypot(q.u - p.u, q.v - p.v);
        if (!best || d < best.d) best = { from: p, to: q, d };
      }
    }
    // Beyond ~1,700 ft a connecting structure stops being plausible; below
    // that, the longer the span the more likely it is a people-mover rather
    // than a walkway.
    if (!best || best.d >= 1700) continue;
    const kind: TerminalLink["kind"] = best.d > 1100 ? "people-mover" : best.d > 600 ? "walkway" : "connector";
    links.push({
      id: `link-${i}`,
      fromUnitId: ordered[i]!.id,
      toUnitId: ordered[i + 1]!.id,
      kind,
      points: [toWorld(best.from), toWorld(best.to)],
    });
    // A drawn connector is real structure; walkways and people-movers are
    // elevated and charted as a thin link rather than a building mass.
    if (kind === "connector") {
      const mid = { u: (best.from.u + best.to.u) / 2, v: (best.from.v + best.to.v) / 2 };
      const angle = Math.atan2(best.to.v - best.from.v, best.to.u - best.from.u);
      comps.push(makeComp(`comp-link-${i}`, ordered[i]!.id, "connector", "bridge",
        rotateAbout(bar(mid.u, mid.v, best.d, 70), mid, angle), connectorRule, "", "concourse", true, true));
    }
  }

  // A named RON ramp in the pocket between sibling terminals — the ramp label
  // real charts carry where two estates share overnight parking.
  // Sorted by position: placements alternate sides, so index order is not
  // spatial order and the ramp would land between non-neighbours.
  const byU = placements.map((p) => p.u).sort((a, b) => a - b);
  for (let i = 0; i + 1 < byU.length && i < 3; i++) {
    const midU = (byU[i]! + byU[i + 1]!) / 2;
    aprons.push({ id: `ramp-${i + 1}`, kind: "ron", label: `RAMP ${i + 1}`, polygon: bar(midU, vCollector - 300, 10, 10).map(toWorld) });
  }

  const system: TerminalSystem = {
    units: unitSpecs.map((unit): TerminalUnit => ({
      id: unit.id, name: unit.name, curbLength: unit.curbLength, parkingDepth: unit.parkingDepth,
      form: unit.form, gates: unit.gates,
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
    links,
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
