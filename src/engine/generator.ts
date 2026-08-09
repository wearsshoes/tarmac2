import { RNG } from "./rng";
import { add, perp, pointAlong, pointInPolygon, pointSegmentDistance, polar, polylineDistance, rect, runwayEndpoints, scale, segmentIntersection } from "./geometry";
import { makeIdentity } from "./identity";
import { buildTerminal, type TerminalComplex } from "./terminal";
import type { Apron, Beacon, Building, DesignCode, Frequency, GenerateOptions, HoldLine, Hotspot, Identity, LahsoMark, Point, Role, Runway, RunwayEnd, RunwayLifecycle, SiteModel, Stand, Taxilane, Taxiway, TerminalArchetype, TerminalSystem } from "./types";

/** Only active runways get taxiway service, hotspots, LAHSO, and RPZs. */
const isActive = (runway: Runway): boolean => runway.lifecycle === "active";

const ROLES: Role[] = ["basic-ga", "business-ga", "regional", "mid-hub", "major-hub", "mega-hub"];
const TAXI_LETTERS = "ABCDEFGHJKLMNPQRSTUVWYZ".split("");

const ROLE = {
  "basic-ga":    { code: ["B", "II", "2A", "VISUAL", 25, 240, 175] as const, length: [2800, 5000] as const, ga: 0 },
  "business-ga": { code: ["B", "II", "2A", "2400", 35, 300, 200] as const, length: [5000, 7000] as const, ga: 0.25 },
  regional:      { code: ["C", "III", "3", "2400", 50, 400, 250] as const, length: [7000, 9600] as const, ga: 0.5 },
  "mid-hub":     { code: ["C", "IV", "4", "1200", 50, 400, 250] as const, length: [8800, 11000] as const, ga: 0.65 },
  "major-hub":   { code: ["D", "V", "5", "1200", 75, 450, 280] as const, length: [10000, 12500] as const, ga: 0.85 },
  "mega-hub":    { code: ["D", "V", "5", "1200", 75, 500, 280] as const, length: [11000, 13500] as const, ga: 1 },
};

function snap(value: number, increment: number): number { return Math.round(value / increment) * increment; }
function pad2(value: number): string { return String(value).padStart(2, "0"); }

function designFor(role: Role): DesignCode {
  const [aac, adg, tdg, visibility, taxiwayWidth, runwayTaxiwaySeparation, holdDistance] = ROLE[role].code;
  return { aac, adg, tdg, visibility, taxiwayWidth, runwayTaxiwaySeparation, holdDistance };
}

/** Runway numbering per harvest H3: magnetic = true − variation. */
function runwayNumber(trueHeading: number, variation: number): number {
  const mag = ((trueHeading - variation) % 360 + 360) % 360;
  const n = Math.round(mag / 10) % 36;
  return n === 0 ? 36 : n;
}
const reciprocalNumber = (n: number): number => ((n + 17) % 36) + 1;

interface BankSlot { w: number; u: number; lengthScale: number; /** Renumbering group (parallel pairs share a runway number). */ group?: number; }

/** Parallel separations and staggers drawn from the standard families actually
 * charted (close dual, intermediate, wide independent), not one value per role. */
function bankSlots(role: Role, rng: RNG, primaryLength: number): BankSlot[] {
  const stagger = () => rng.float(-0.22, 0.22) * primaryLength;
  switch (role) {
    case "basic-ga": return [{ w: 0, u: 0, lengthScale: 1 }];
    case "business-ga":
      return rng.chance(0.22)
        ? [{ w: 0, u: 0, lengthScale: 1 }, { w: -rng.pick([700, 1000]), u: stagger(), lengthScale: rng.float(0.6, 0.75) }]
        : [{ w: 0, u: 0, lengthScale: 1 }];
    case "regional": {
      const sep = rng.pick([700, 1200, 2500, 3400]);
      return [{ w: sep / 2, u: 0, lengthScale: 1 }, { w: -sep / 2, u: stagger(), lengthScale: rng.float(0.72, 0.95) }];
    }
    case "mid-hub": {
      const sep = rng.pick([2000, 2500, 3400]);
      return [{ w: sep / 2, u: 0, lengthScale: 1 }, { w: -sep / 2, u: stagger(), lengthScale: rng.float(0.8, 0.95) }];
    }
    case "major-hub": {
      const sep = rng.pick([2500, 3400, 4300]);
      return [
        { w: sep, u: 0, lengthScale: 1 },
        { w: 0, u: stagger(), lengthScale: rng.float(0.85, 1) },
        { w: -sep, u: stagger(), lengthScale: rng.float(0.8, 0.92) },
      ];
    }
    case "mega-hub": {
      // 2-3 widely separated bank groups of 1-2 close parallels each: 4-6
      // active runways in the primary family (ORD/DEN/AMS scale), not a fixed
      // quad. Groups renumber independently.
      const gap = rng.pick([3900, 5200, 6600]);
      const pairSep = rng.pick([700, 1000]);
      const groupCount = rng.chance(0.45) ? 3 : 2;
      const centers = groupCount === 2 ? [gap / 2, -gap / 2] : [gap, 0, -gap];
      const slots: BankSlot[] = [];
      centers.forEach((center, group) => {
        if (rng.chance(0.78)) {
          slots.push({ w: center + pairSep / 2, u: stagger(), lengthScale: rng.float(0.85, 1), group });
          slots.push({ w: center - pairSep / 2, u: stagger(), lengthScale: rng.float(0.8, 0.95), group });
        } else {
          slots.push({ w: center, u: stagger(), lengthScale: rng.float(0.85, 1), group });
        }
      });
      // Mega fields never drop below four in the family: widen the outermost
      // group into a pair if the draws ran lean.
      let extra = 0;
      while (slots.length < 4) {
        extra++;
        slots.push({ w: centers[0]! + pairSep / 2 + 2500 * extra, u: stagger(), lengthScale: rng.float(0.8, 0.9), group: centers.length + extra });
      }
      slots[0]!.lengthScale = 1;
      slots[0]!.u = 0;
      return slots;
    }
  }
}

function widthFor(length: number, isPrimary: boolean): number {
  if (length > 9500) return 150;
  if (length > 7000) return isPrimary ? 150 : 100;
  return isPrimary ? 100 : 75;
}

function pcnString(length: number, rng: RNG): string {
  const w = length / 13500;
  const value = Math.max(8, Math.round(rng.gauss(92 * w, 12)));
  return `PCN ${value} ${rng.pick(["R", "R", "F"])}/${rng.pick(["A", "B", "B", "C"])}/${rng.pick(["W", "X"])}/${rng.pick(["T", "U"])}`;
}

function makeEnds(rng: RNG, identity: Identity, heading: number, number: number, suffix: string, length: number): [RunwayEnd, RunwayEnd] {
  const mirror = (s: string) => (s === "L" ? "R" : s === "R" ? "L" : s);
  const big = length > 9000;
  const makeEnd = (designator: string, mag: number): RunwayEnd => {
    const emas = big && rng.chance(0.2) ? snap(rng.float(300, 600), 50) : 0;
    // End features stay proportionate: a short strip never grows a blast pad
    // half its own length.
    return {
      designator,
      elevation: Math.round(identity.elevation - Math.abs(rng.gauss(0, 7))),
      magneticHeading: Math.round((((mag % 360) + 360) % 360) * 10) / 10,
      displaced: rng.chance(0.22) ? snap(Math.min(rng.float(200, 900), length * 0.13), 50) : 0,
      blastPad: !emas && rng.chance(0.28) ? snap(Math.min(rng.float(200, 1000), length * 0.16), 100) : 0,
      emas,
    };
  };
  const mag = ((heading - identity.variation) % 360 + 360) % 360;
  return [
    makeEnd(`${pad2(number)}${suffix}`, mag),
    makeEnd(`${pad2(reciprocalNumber(number))}${mirror(suffix)}`, mag + 180),
  ];
}

function protectionZones(runways: Runway[], precision: boolean): Point[][] {
  return runways.flatMap((runway) => {
    const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
    const zoneLength = precision ? 2500 : 1000;
    const nearWidth = precision ? 1000 : 250;
    const farWidth = precision ? 1750 : 450;
    return [a, b].map((endpoint, index) => {
      const direction = polar(runway.heading + (index === 0 ? 180 : 0));
      const lateral = perp(direction);
      const near = add(endpoint, scale(direction, 200));
      const far = add(near, scale(direction, zoneLength));
      return [add(near, scale(lateral, -nearWidth / 2)), add(near, scale(lateral, nearWidth / 2)), add(far, scale(lateral, farWidth / 2)), add(far, scale(lateral, -farWidth / 2))];
    });
  });
}

function frame(heading: number): { at: (u: number, w: number) => Point; axis: Point; lateral: Point } {
  const axis = polar(heading);
  const lateral = perp(axis);
  return { axis, lateral, at: (u, w) => add(scale(axis, u), scale(lateral, w)) };
}

interface TaxiRoute { points: Point[]; width: number; kind: Taxiway["kind"]; runwayId?: string; connectorStation?: number; parentRoute?: number; unlabeled?: boolean; }

/** Taxiway solver per harvest H4 + Phase 2 topology density: parallels with
 * threshold jogs, end-clustered connector cadence, angled threshold entrances,
 * holding-bay lobes, flow-biased high-speed exits, dual-parallel crossovers,
 * GA turnaround substitution, crossfield spines, letters by descending length. */
function buildTaxiways(rng: RNG, runways: Runway[], role: Role, design: DesignCode, coreW: number): { taxiways: Taxiway[]; holds: HoldLine[]; pads: Apron[] } {
  const routes: TaxiRoute[] = [];
  const holds: HoldLine[] = [];
  const pads: Apron[] = [];
  const hub = role.includes("hub");
  const open = runways.filter(isActive);

  open.forEach((runway, runwayIndex) => {
    const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
    const runAxis = polar(runway.heading);
    const runLateral = perp(runAxis);
    const centerW = runway.center.x * runLateral.x + runway.center.y * runLateral.y;
    const side = Math.sign(coreW - centerW) || 1;
    const separation = design.runwayTaxiwaySeparation;
    const jog = rng.float(50, 100);
    const canonical = Math.abs(runAxis.x) >= Math.abs(runAxis.y) ? (runAxis.x >= 0 ? 1 : -1) : (runAxis.y >= 0 ? 1 : -1);
    const busy = runway.length >= 7400;

    // Basic visual GA may substitute turnarounds for the full-length parallel
    // (spec A3): unlabeled pavement pads at both ends plus plain connectors.
    // The substitution only happens when both pads clear every other runway.
    const padFor = (endpoint: Point, endIndex: number): Point[] => {
      const inward = polar(runway.heading + (endIndex === 0 ? 0 : 180));
      const across = scale(runLateral, side);
      const lo = runway.width / 2 + 45;
      return [
        add(endpoint, scale(across, lo)),
        add(add(endpoint, scale(inward, 320)), scale(across, lo)),
        add(add(endpoint, scale(inward, 260)), scale(across, lo + 150)),
        add(add(endpoint, scale(inward, 60)), scale(across, lo + 150)),
      ];
    };
    const padClears = (pad: Point[]): boolean => runways.every((other) => {
      if (other.id === runway.id) return true;
      const [oa, ob] = runwayEndpoints(other.center, other.heading, other.length);
      const clearance = other.width / 2 + 60;
      return pad.every((point, index) => {
        const next = pad[(index + 1) % pad.length]!;
        return pointSegmentDistance(point, oa, ob) >= clearance && !segmentIntersection(oa, ob, point, next);
      });
    });
    const candidatePads = [padFor(a, 0), padFor(b, 1)];
    const turnaround = role === "basic-ga" && candidatePads.every(padClears) && rng.chance(runwayIndex === 0 ? 0.35 : 0.6);
    if (turnaround) {
      candidatePads.forEach((pad, endIndex) => {
        pads.push({ id: `turnaround-${runway.id}-${endIndex}`, kind: "hold-pad", polygon: pad });
      });
      for (const t of [0.32, 0.68]) {
        const runwayPoint = pointAlong(a, b, t);
        routes.push({
          kind: "connector", runwayId: runway.id, width: design.taxiwayWidth,
          points: [runwayPoint, add(runwayPoint, scale(runLateral, side * separation))],
          connectorStation: canonical > 0 ? t : 1 - t,
        });
        holds.push({ point: add(runwayPoint, scale(runLateral, side * design.holdDistance)), angle: runway.heading, runwayId: runway.id });
      }
      return;
    }

    const parallelIndex = routes.length;
    // Threshold jogs: reverse-curve outward within ~1,500 ft of each end (holding-bay room).
    const jogT = Math.min(0.16, 1500 / runway.length);
    routes.push({
      kind: "parallel", runwayId: runway.id, width: design.taxiwayWidth,
      points: [
        add(add(a, scale(runLateral, side * (separation + jog))), scale(runAxis, -120)),
        add(pointAlong(a, b, jogT * 0.55), scale(runLateral, side * (separation + jog))),
        add(pointAlong(a, b, jogT), scale(runLateral, side * separation)),
        add(pointAlong(a, b, 1 - jogT), scale(runLateral, side * separation)),
        add(pointAlong(a, b, 1 - jogT * 0.55), scale(runLateral, side * (separation + jog))),
        add(add(b, scale(runLateral, side * (separation + jog))), scale(runAxis, 120)),
      ],
    });
    // Dual parallel between the primary and the terminal at busy fields, with
    // crossover connectors so the pair reads as one system.
    if (hub && runwayIndex === 0) {
      const dualIndex = routes.length;
      routes.push({
        kind: "parallel", runwayId: runway.id, width: design.taxiwayWidth,
        points: [
          add(pointAlong(a, b, 0.05), scale(runLateral, side * (separation + 400))),
          add(pointAlong(a, b, 0.95), scale(runLateral, side * (separation + 400))),
        ],
      });
      for (const t of [rng.float(0.24, 0.34), rng.float(0.64, 0.76)]) {
        if (!rng.chance(0.75)) continue;
        routes.push({
          kind: "connector", runwayId: runway.id, width: design.taxiwayWidth,
          points: [
            add(pointAlong(a, b, t), scale(runLateral, side * separation)),
            add(pointAlong(a, b, t), scale(runLateral, side * (separation + 400))),
          ],
          parentRoute: dualIndex, connectorStation: canonical > 0 ? t : 1 - t,
        });
      }
    }

    // Connector cadence: thresholds always, an extra near-end pair on busy
    // runways (the recognizable cluster), then a sparser midfield spread.
    const stations = [0.015, 0.985];
    if (busy) {
      stations.push(0.052 + rng.float(-0.008, 0.014), 0.948 + rng.float(-0.014, 0.008));
    }
    const midCount = Math.max(1, Math.min(4, Math.round(runway.length / 3300) - (role === "basic-ga" ? 1 : 0)));
    for (let i = 0; i < midCount; i++) stations.push(0.22 + (0.56 * (i + 0.5)) / midCount + rng.float(-0.045, 0.045));
    stations.sort((x, y) => x - y);
    stations.forEach((t) => {
      const runwayPoint = pointAlong(a, b, t);
      const jogHere = t < jogT || t > 1 - jogT ? jog : 0;
      const taxiPoint = add(runwayPoint, scale(runLateral, side * (separation + jogHere)));
      const isThreshold = t < 0.03 || t > 0.97;
      // Busy thresholds get an angled entrance: the connector leans toward the
      // runway end instead of meeting it square.
      const points = busy && isThreshold
        ? [runwayPoint, add(pointAlong(runwayPoint, taxiPoint, 0.5), scale(runAxis, (t < 0.5 ? -1 : 1) * separation * 0.38)), taxiPoint]
        : [runwayPoint, taxiPoint];
      routes.push({
        kind: "connector", runwayId: runway.id, width: design.taxiwayWidth,
        points, parentRoute: parallelIndex,
        connectorStation: canonical > 0 ? t : 1 - t,
      });
      holds.push({ point: add(runwayPoint, scale(runLateral, side * design.holdDistance)), angle: runway.heading, runwayId: runway.id, kind: design.visibility === "1200" && isThreshold ? "ils" : undefined });
    });

    // Holding-bay lobes beside the jogged parallel near instrument thresholds:
    // reverse-curve loops that leave and rejoin the parallel.
    if (busy && (hub || design.visibility === "1200")) {
      for (const endT of [0, 1]) {
        if (!rng.chance(0.65)) continue;
        const sign = endT === 0 ? 1 : -1;
        const tA = endT === 0 ? 0.025 : 0.975;
        const tB = endT === 0 ? 0.085 : 0.915;
        const wBase = separation + jog;
        routes.push({
          kind: "bay", runwayId: runway.id, width: design.taxiwayWidth * 1.7, unlabeled: true,
          points: [
            add(pointAlong(a, b, tA), scale(runLateral, side * wBase)),
            add(pointAlong(a, b, tA + sign * 0.018), scale(runLateral, side * (wBase + 130))),
            add(pointAlong(a, b, tB - sign * 0.018), scale(runLateral, side * (wBase + 130))),
            add(pointAlong(a, b, tB), scale(runLateral, side * wBase)),
          ],
        });
      }
    }

    // High-speed exits: 30° off, landing exactly on the parallel. Presence and
    // direction follow the landing flow instead of appearing in fixed pairs.
    if (runway.length >= 9000) {
      const flow = rng.chance(0.5) ? 1 : -1;
      for (const dir of [1, -1] as const) {
        if (!rng.chance(dir === flow ? 0.9 : 0.45)) continue;
        const t0 = rng.float(0.56, 0.68);
        const t = dir === 1 ? t0 : 1 - t0;
        const start = pointAlong(a, b, t);
        const run = separation / Math.tan(Math.PI / 6);
        const land = add(add(start, scale(runAxis, dir * run)), scale(runLateral, side * separation));
        const mid = add(pointAlong(start, land, 0.42), scale(runAxis, dir * run * 0.18));
        routes.push({
          kind: "exit", runwayId: runway.id, width: design.taxiwayWidth,
          points: [start, mid, land], parentRoute: parallelIndex,
          connectorStation: canonical > 0 ? t : 1 - t,
        });
        // A second staggered exit in the dominant flow at the biggest fields.
        if (dir === flow && role === "mega-hub" && rng.chance(0.5)) {
          const t2 = dir === 1 ? t0 + 0.13 : 1 - t0 - 0.13;
          const start2 = pointAlong(a, b, t2);
          const land2 = add(add(start2, scale(runAxis, dir * run)), scale(runLateral, side * separation));
          routes.push({
            kind: "exit", runwayId: runway.id, width: design.taxiwayWidth,
            points: [start2, add(pointAlong(start2, land2, 0.42), scale(runAxis, dir * run * 0.18)), land2], parentRoute: parallelIndex,
            connectorStation: canonical > 0 ? t2 : 1 - t2,
          });
        }
      }
    }
  });

  // Crossfield spines at mid-field crossings, avoiding the middle third where possible.
  if (open.length > 1) {
    const primary = open[0]!;
    const { axis, lateral } = frame(primary.heading);
    const ws = open.map((r) => r.center.x * lateral.x + r.center.y * lateral.y);
    const lo = Math.min(...ws) - design.runwayTaxiwaySeparation;
    const hi = Math.max(...ws) + design.runwayTaxiwaySeparation;
    const fractions = hub ? [-0.26, 0.26] : [rng.pick([-0.24, 0.24])];
    for (const f of fractions) {
      const u = (primary.center.x * axis.x + primary.center.y * axis.y) + f * primary.length;
      routes.push({ kind: "service", width: design.taxiwayWidth, points: [add(scale(axis, u), scale(lateral, lo)), add(scale(axis, u), scale(lateral, hi))] });
    }
  }

  // Delete connectors and exits that cross an active runway they do not serve —
  // a short stub has no business crossing a foreign runway corridor.
  const dropped = new Set<number>();
  routes.forEach((route, index) => {
    if (route.kind !== "connector" && route.kind !== "exit") return;
    for (const other of open) {
      if (other.id === route.runwayId) continue;
      const [oa, ob] = runwayEndpoints(other.center, other.heading, other.length);
      for (let k = 0; k < route.points.length - 1; k++) {
        if (segmentIntersection(route.points[k]!, route.points[k + 1]!, oa, ob)) { dropped.add(index); return; }
      }
    }
  });

  // Letters by descending path length (A is always the longest parallel), then
  // connector stubs <letter><digit> numbered from the canonical axis end.
  // Orphan connectors (turnaround fields have no parallel) letter directly.
  const pathLength = (points: Point[]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);
  const lettered = routes.map((route, index) => ({ route, index }))
    .filter(({ route, index }) => !dropped.has(index) && !route.unlabeled &&
      (route.kind === "parallel" || route.kind === "service" || (route.kind === "connector" && route.parentRoute === undefined)));
  lettered.sort((one, two) => pathLength(two.route.points) - pathLength(one.route.points));
  const names = new Map<number, string>();
  lettered.forEach(({ index }, i) => names.set(index, TAXI_LETTERS[i % TAXI_LETTERS.length]!));
  const byParent = new Map<number, { index: number; station: number }[]>();
  routes.forEach((route, index) => {
    if (route.parentRoute === undefined || dropped.has(index)) return;
    if (!byParent.has(route.parentRoute)) byParent.set(route.parentRoute, []);
    byParent.get(route.parentRoute)!.push({ index, station: route.connectorStation ?? 0 });
  });
  for (const [parent, children] of byParent) {
    const letter = names.get(parent) ?? "Z";
    children.sort((one, two) => one.station - two.station);
    children.forEach(({ index }, i) => names.set(index, `${letter}${Math.min(9, i + 1)}`));
  }

  const taxiways: Taxiway[] = routes.flatMap((route, index) => {
    if (dropped.has(index)) return [];
    const name = names.get(index) ?? "";
    return [{
      id: `twy-${index}`,
      name,
      points: route.points,
      width: route.width,
      kind: route.kind,
      runwayId: route.runwayId,
      unlabeled: route.unlabeled || name === "",
    }];
  });
  return { taxiways, holds, pads };
}

/** Rng-free connectivity repair (harvest H4 + Phase 2 routing quality): union-find
 * over taxiways, then bridge the two largest components. Bridges route along the
 * field frame (L-shaped corridors), never through an RPZ, and prefer paths that
 * avoid crossing runways at all. */
function repairConnectivity(taxiways: Taxiway[], width: number, zones: Point[][], runways: Runway[], heading: number): void {
  const { axis, lateral } = frame(heading);
  const uw = (p: Point): Point => ({ x: p.x * axis.x + p.y * axis.y, y: p.x * lateral.x + p.y * lateral.y });
  const world = (c: Point): Point => add(scale(axis, c.x), scale(lateral, c.y));
  const active = runways.filter(isActive).map((r) => runwayEndpoints(r.center, r.heading, r.length));

  const segmentHitsZone = (a: Point, b: Point): boolean => zones.some((zone) => {
    if (pointInPolygon(pointAlong(a, b, 0.5), zone)) return true;
    for (let i = 0; i < zone.length; i++) {
      if (segmentIntersection(a, b, zone[i]!, zone[(i + 1) % zone.length]!)) return true;
    }
    return false;
  });
  const pathScore = (points: Point[]): number => {
    let crossings = 0;
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i]!;
      const q = points[i + 1]!;
      if (segmentHitsZone(p, q)) return Number.POSITIVE_INFINITY;
      for (const [ra, rb] of active) if (segmentIntersection(p, q, ra, rb)) crossings++;
      length += Math.hypot(q.x - p.x, q.y - p.y);
    }
    return crossings * 50_000 + length;
  };

  for (let pass = 0; pass < 24; pass++) {
    const parent = taxiways.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    for (let i = 0; i < taxiways.length; i++) for (let j = i + 1; j < taxiways.length; j++) {
      if (polylineDistance(taxiways[i]!.points, taxiways[j]!.points) < 40) parent[find(i)] = find(j);
    }
    const components = new Map<number, number[]>();
    taxiways.forEach((_, i) => {
      const root = find(i);
      if (!components.has(root)) components.set(root, []);
      components.get(root)!.push(i);
    });
    if (components.size <= 1) return;
    const sorted = [...components.values()].sort((one, two) => two.length - one.length);
    const big = sorted[0]!;
    // Consider the closest endpoint pairs whose endpoints sit outside every RPZ,
    // each via direct and jittered L-shaped corridor routes in the field frame.
    // If the second-largest component has no such endpoints, try the others.
    const outsideZones = (p: Point): boolean => zones.every((zone) => !pointInPolygon(p, zone));
    let pairs: { a: Point; b: Point; d: number }[] = [];
    for (const next of sorted.slice(1)) {
      for (const i of big) for (const j of next) {
        for (const p of taxiways[i]!.points) for (const q of taxiways[j]!.points) {
          if (!outsideZones(p) || !outsideZones(q)) continue;
          pairs.push({ a: p, b: q, d: Math.hypot(p.x - q.x, p.y - q.y) });
        }
      }
      if (pairs.length > 0) break;
    }
    if (pairs.length === 0) return;
    pairs.sort((one, two) => one.d - two.d);
    let bestPath: Point[] | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const { a, b } of pairs.slice(0, 12)) {
      const ca = uw(a);
      const cb = uw(b);
      const candidates: Point[][] = [[a, b]];
      for (const offset of [0, 700, -700, 1500, -1500]) {
        candidates.push(
          [a, world({ x: cb.x + offset, y: ca.y }), world({ x: cb.x + offset, y: cb.y }), b],
          [a, world({ x: ca.x, y: cb.y + offset }), world({ x: cb.x, y: cb.y + offset }), b],
        );
      }
      for (const path of candidates) {
        const score = pathScore(path);
        if (score < bestScore) { bestScore = score; bestPath = path; }
      }
    }
    if (!bestPath || bestScore === Number.POSITIVE_INFINITY) return;
    taxiways.push({ id: `repair-${pass}`, name: "", points: bestPath, width, kind: "service", unlabeled: true });
  }
}

function terminalChoice(role: Role, rng: RNG, override?: TerminalArchetype): TerminalArchetype {
  if (override) return override;
  const options: Record<Role, TerminalArchetype[]> = {
    "basic-ga": ["none"], "business-ga": ["none", "none", "linear"], regional: ["linear", "linear", "pier"],
    "mid-hub": ["pier", "pier", "parallel", "unit"], "major-hub": ["pier", "parallel", "satellite", "unit", "semicircle"],
    "mega-hub": ["parallel", "parallel", "satellite", "unit", "semicircle", "pier"],
  };
  return rng.pick(options[role]);
}

const COMPASS = ["NORTH", "NORTHEAST", "EAST", "SOUTHEAST", "SOUTH", "SOUTHWEST", "WEST", "NORTHWEST"];
function compassName(point: Point): string {
  const angle = ((Math.atan2(point.x, point.y) * 180 / Math.PI) + 360) % 360;
  return COMPASS[Math.round(angle / 45) % 8]!;
}

interface Districts { buildings: Building[]; aprons: Apron[]; throats: Taxiway[]; terminal: TerminalSystem | null; stands: Stand[]; taxilanes: Taxilane[] }

/** District & facility zoo per harvest H5 cluster recipes. */
function buildDistricts(rng: RNG, role: Role, archetype: TerminalArchetype, heading: number, primaryLength: number, side: number, outerW: number, networkW: number, design: DesignCode, runways: Runway[], zones: Point[][], complex: TerminalComplex | null, midfieldGap: [number, number] | null): Districts {
  const { at } = frame(heading);
  const ga = ROLE[role].ga;
  const hub = role.includes("hub");
  const buildings: Building[] = [];
  const aprons: Apron[] = [];
  const throats: Taxiway[] = [];
  let terminal: TerminalSystem | null = null;
  const stands: Stand[] = [];
  const taxilanes: Taxilane[] = [];
  const wAt = (w: number) => side * w;
  const uSpread = primaryLength / 2;
  // Clearance considers every runway with visible pavement, including non-active
  // states and dotted future outlines — districts must not sit on any of them —
  // and every runway protection zone, so cluster pavement never lands in an RPZ.
  const clearOfZones = (polygon: Point[]): boolean => zones.every((zone) => {
    if (polygon.some((point) => pointInPolygon(point, zone))) return false;
    if (zone.some((corner) => pointInPolygon(corner, polygon))) return false;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!; const b = polygon[(i + 1) % polygon.length]!;
      for (let j = 0; j < zone.length; j++) {
        if (segmentIntersection(a, b, zone[j]!, zone[(j + 1) % zone.length]!)) return false;
      }
    }
    return true;
  });
  const clearOfRunways = (polygon: Point[], margin: number): boolean => clearOfZones(polygon) && runways.every((r) => {
      const [ra, rb] = runwayEndpoints(r.center, r.heading, r.length);
      const clearance = margin + r.width / 2;
      if (polygon.some((point) => pointSegmentDistance(point, ra, rb) < clearance)) return false;
      if (pointInPolygon(ra, polygon) || pointInPolygon(rb, polygon)) return false;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!; const b = polygon[(i + 1) % polygon.length]!;
        if (segmentIntersection(ra, rb, a, b)) return false;
        if (pointSegmentDistance(ra, a, b) < clearance || pointSegmentDistance(rb, a, b) < clearance) return false;
      }
      return true;
    });
  // Cluster footprints, not just their corners, must clear every runway corridor.
  const slide = (candidates: number[], footprint: (u: number) => Point[], margin = 520): number =>
    candidates.find((u) => clearOfRunways(footprint(u), margin)) ?? candidates[0]!;

  // District aprons carry stand rows + a taxilane, not just a labeled polygon
  // (terminal-generator-plan stage 8, reduced-fidelity stand-row vocabulary).
  const lateralDir = perp(polar(heading));
  const standRow = (apronId: string, uCenter: number, halfLen: number, wRow: number, wAlley: number, rowSide: number, pitch: number, cls: "regional" | "narrow" | "wide", facingOut: boolean): void => {
    const count = Math.max(2, Math.min(14, Math.floor((2 * halfLen - 80) / pitch)));
    const facing = scale(lateralDir, rowSide * (facingOut ? 1 : -1));
    for (let i = 0; i < count; i++) {
      const u = uCenter - ((count - 1) / 2) * pitch + i * pitch;
      stands.push({
        id: `stand-${apronId}-${i}`, ownerId: apronId,
        center: at(u, rowSide * wRow), facing,
        aircraftClass: cls, pitch, depth: cls === "wide" ? 190 : cls === "narrow" ? 140 : 100,
      });
    }
    taxilanes.push({
      id: `lane-${apronId}`, ownerId: apronId, kind: "alley", width: 60,
      points: [at(uCenter - halfLen + 60, rowSide * wAlley), at(uCenter + halfLen - 60, rowSide * wAlley)],
    });
  };

  let terminalSpanU: [number, number] = [0, 0];
  if (complex) {
    const preferredU = rng.float(-0.18, 0.18) * primaryLength;
    const candidates = [preferredU, ...[-0.12, 0.12, -0.25, 0.25, -0.38, 0.38, -0.52, 0.52, -0.66, 0.66, -0.8, 0.8].map((fraction) => fraction * primaryLength)];
    const terminalPolygons = (u: number): { buildings: Point[][]; aprons: Point[][] } => {
      if (midfieldGap) {
        const mid = (midfieldGap[0] + midfieldGap[1]) / 2;
        const toWorld = (p: Point) => at(u + p.x, mid + side * (p.y - complex.apronEdgeV / 2));
        return { buildings: complex.buildings.map((building) => building.polygon.map(toWorld)), aprons: complex.aprons.map((apron) => apron.polygon.map(toWorld)) };
      }
      const edgeW = outerW + 250;
      const toWorld = (p: Point) => at(u + p.x, wAt(edgeW + (complex.apronEdgeV - p.y)));
      return { buildings: complex.buildings.map((building) => building.polygon.map(toWorld)), aprons: complex.aprons.map((apron) => apron.polygon.map(toWorld)) };
    };
    const uTerm = candidates.find((u) => {
      const polygons = terminalPolygons(u);
      return polygons.buildings.every((polygon) => clearOfRunways(polygon, 500)) && polygons.aprons.every((polygon) => clearOfRunways(polygon, 120));
    }) ?? candidates[candidates.length - 1]!;
    // Transform every typed record — hierarchy, edges, stands, taxilanes,
    // courts — through the same placement as the drawn polygons.
    const placeSystem = (toWorld: (p: Point) => Point): void => {
      const mapPoly = (poly: Point[]): Point[] => poly.map(toWorld);
      const origin = toWorld({ x: 0, y: 0 });
      const mapDir = (d: Point): Point => {
        const q = toWorld(d);
        const len = Math.hypot(q.x - origin.x, q.y - origin.y) || 1;
        return { x: (q.x - origin.x) / len, y: (q.y - origin.y) / len };
      };
      terminal = {
        units: complex.system.units.map((unit) => ({ ...unit, landsideCourt: mapPoly(unit.landsideCourt) })),
        components: complex.system.components.map((component) => ({
          ...component,
          polygon: mapPoly(component.polygon),
          edges: component.edges.map((edge) => ({ ...edge, a: toWorld(edge.a), b: toWorld(edge.b) })),
        })),
        roadCourts: complex.system.roadCourts.map(mapPoly),
        accretion: complex.system.accretion,
        gatesPlanned: complex.system.gatesPlanned,
      };
      stands.push(...complex.stands.map((stand) => ({ ...stand, center: toWorld(stand.center), facing: mapDir(stand.facing) })));
      taxilanes.push(...complex.taxilanes.map((lane) => ({ ...lane, points: lane.points.map(toWorld) })));
    };
    if (midfieldGap) {
      // Midfield complex between the runway banks (ATL/DEN pattern).
      const mid = (midfieldGap[0] + midfieldGap[1]) / 2;
      const toWorld = (p: Point) => at(uTerm + p.x, mid + side * (p.y - complex.apronEdgeV / 2));
      for (const building of complex.buildings) buildings.push({ ...building, polygon: building.polygon.map(toWorld) });
      for (const apron of complex.aprons) aprons.push({ ...apron, polygon: apron.polygon.map(toWorld) });
      placeSystem(toWorld);
      const edgeW = mid + side * (complex.apronEdgeV / 2);
      const target = side > 0 ? Math.max(...midfieldGap) - design.runwayTaxiwaySeparation : Math.min(...midfieldGap) + design.runwayTaxiwaySeparation;
      for (const [i, u] of complex.throats.entries()) {
        throats.push({ id: `throat-${i}`, name: "", points: [at(uTerm + u, edgeW - side * 10), at(uTerm + u, target)], width: 90, kind: "apron-throat", unlabeled: true });
      }
    } else {
      const edgeW = outerW + 250;
      const toWorld = (p: Point) => at(uTerm + p.x, wAt(edgeW + (complex.apronEdgeV - p.y)));
      for (const building of complex.buildings) buildings.push({ ...building, polygon: building.polygon.map(toWorld) });
      for (const apron of complex.aprons) aprons.push({ ...apron, polygon: apron.polygon.map(toWorld) });
      placeSystem(toWorld);
      for (const [i, u] of complex.throats.entries()) {
        throats.push({ id: `throat-${i}`, name: "", points: [at(uTerm + u, wAt(edgeW + 10)), at(uTerm + u, wAt(networkW))], width: hub ? 90 : 60, kind: "apron-throat", unlabeled: true });
      }
    }
    terminalSpanU = [uTerm + complex.extentU[0], uTerm + complex.extentU[1]];
  }

  // GA ramp: apron + hangar grid + FBO placed cluster-atomically.
  {
    const gaSide = archetype === "none" ? side : -side;
    const gaW = archetype === "none" ? outerW + 250 : networkW + 320;
    const halfLen = 450 + ga * 650;
    const depth = 250 + ga * 250;
    const clusterDepth = depth + 40 + 3 * 170 + 105;
    const uGA0 = archetype === "none" ? rng.float(-0.15, 0.1) * primaryLength : rng.pick([-1, 1]) * rng.float(0.55, 0.8) * uSpread;
    const uGA = slide(
      [uGA0, uGA0 - 0.2 * primaryLength, uGA0 + 0.2 * primaryLength, uGA0 - 0.38 * primaryLength, uGA0 + 0.38 * primaryLength,
        uGA0 - 0.55 * primaryLength, uGA0 + 0.55 * primaryLength, uGA0 - 0.72 * primaryLength, uGA0 + 0.72 * primaryLength],
      (u) => [at(u - halfLen, gaSide * gaW), at(u + halfLen, gaSide * gaW), at(u + halfLen, gaSide * (gaW + clusterDepth)), at(u - halfLen, gaSide * (gaW + clusterDepth))],
      300,
    );
    aprons.push({
      id: "ga-apron", kind: "ga", label: "GENERAL AVIATION PARKING", tieDowns: true,
      polygon: [at(uGA - halfLen, gaSide * gaW), at(uGA + halfLen, gaSide * gaW), at(uGA + halfLen, gaSide * (gaW + depth)), at(uGA - halfLen, gaSide * (gaW + depth))],
    });
    standRow("ga-apron", uGA, halfLen, gaW + depth * 0.62, gaW + depth * 0.25, gaSide, 110, "regional", true);
    const rows = rng.int(1, 3);
    const cols = rng.int(2, 6);
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const u = uGA - ((cols - 1) / 2) * 185 + col * 185;
      const w = gaW + depth + 40 + 105 / 2 + row * 170;
      buildings.push({ id: `hangar-${row}-${col}`, kind: "hangar", label: "HANGARS", polygon: rect(at(u, gaSide * w), 124, 105, -heading), unlabeled: row + col > 0 });
    }
    if (rng.chance(0.4 + ga * 0.4)) {
      buildings.push({ id: "fbo", kind: "fbo", label: "FBO", polygon: rect(at(uGA + halfLen - 120, gaSide * (gaW + depth + 105)), 160, 130, -heading) });
    }
    throats.push({ id: "ga-throat", name: "", points: [at(uGA, gaSide * gaW), at(uGA, gaSide * networkW)], width: 50, kind: "apron-throat", unlabeled: true });
  }

  // Cargo campus, apart from the terminal, compass-8 named. Smaller fields only
  // sometimes have one, so district sets vary across the population.
  if (role !== "basic-ga" && (hub || rng.chance(role === "business-ga" ? 0.55 : 0.8))) {
    const uCargo0 = (terminalSpanU[1] > 0 ? 1 : -1) * rng.float(0.6, 0.85) * uSpread * (rng.chance(0.75) ? 1 : -1);
    const cargoSide = Math.abs(uCargo0) > Math.abs(terminalSpanU[1]) + 900 || archetype === "none" ? side : -side;
    const half = 320 + ga * 220;
    const uCargo = slide(
      [uCargo0, uCargo0 - 0.18 * primaryLength, uCargo0 + 0.18 * primaryLength, uCargo0 - 0.34 * primaryLength, uCargo0 + 0.34 * primaryLength,
        uCargo0 - 0.52 * primaryLength, uCargo0 + 0.52 * primaryLength, uCargo0 - 0.7 * primaryLength, uCargo0 + 0.7 * primaryLength],
      (u) => [at(u - half, cargoSide * (networkW + 170)), at(u + half, cargoSide * (networkW + 170)), at(u + half, cargoSide * (networkW + 810)), at(u - half, cargoSide * (networkW + 810))],
      300,
    );
    const center = at(uCargo, cargoSide * (networkW + 320));
    aprons.push({
      id: "cargo-apron", kind: "cargo", label: hub ? `${compassName(center)} CARGO RAMP` : "CARGO",
      polygon: [at(uCargo - half, cargoSide * (networkW + 170)), at(uCargo + half, cargoSide * (networkW + 170)), at(uCargo + half, cargoSide * (networkW + 470)), at(uCargo - half, cargoSide * (networkW + 470))],
    });
    const cargoCount = hub ? 2 : 1;
    for (let i = 0; i < cargoCount; i++) {
      buildings.push({ id: `cargo-${i}`, kind: "cargo", label: "CARGO", unlabeled: i > 0, polygon: rect(at(uCargo - ((cargoCount - 1) / 2) * 420 + i * 420, cargoSide * (networkW + 470 + 340 - 70)), 340, 140, -heading) });
    }
    standRow("cargo-apron", uCargo, half, networkW + 380, networkW + 240, cargoSide, hub ? 230 : 150, hub ? "wide" : "narrow", true);
    throats.push({ id: "cargo-throat", name: "", points: [at(uCargo, cargoSide * (networkW + 200)), at(uCargo, cargoSide * networkW)], width: 60, kind: "apron-throat", unlabeled: true });
  }

  // Fuel farm: 2×2 grid of tanks, labeled once; not universal at small fields.
  if (hub || rng.chance(0.72)) {
    const uFuel0 = rng.pick([-1, 1]) * rng.float(0.85, 1) * uSpread;
    const uFuel = slide([uFuel0, -uFuel0, uFuel0 * 0.7, -uFuel0 * 0.7], (u) => rect(at(u, side * (networkW + 490)), 260, 260, -heading), 300);
    for (let i = 0; i < 4; i++) {
      buildings.push({ id: `fuel-${i}`, kind: "fuel", label: "FUEL FARM", unlabeled: i > 0, polygon: rect(at(uFuel + (i % 2) * 140 - 70, side * (networkW + 420 + Math.floor(i / 2) * 140)), 100, 100, -heading) });
    }
  }

  // Fire stations spread along the field, alternating sides.
  const fireCount = hub ? rng.int(2, 4) : 1;
  for (let i = 0; i < fireCount; i++) {
    const u0 = [(-0.9) * uSpread * 0.6, 0.15 * uSpread, 0.9 * uSpread * 0.7, -0.4 * uSpread][i]!;
    const fireSide = i % 2 === 0 ? side : -side;
    const footprint = (u: number) => rect(at(u, fireSide * (networkW + 260)), 180, 130, -heading);
    const candidates = [u0, u0 + 0.15 * primaryLength, u0 - 0.15 * primaryLength, u0 + 0.3 * primaryLength, u0 - 0.3 * primaryLength, u0 + 0.45 * primaryLength, u0 - 0.45 * primaryLength];
    const u = candidates.find((candidate) => clearOfRunways(footprint(candidate), 420));
    if (u !== undefined) buildings.push({ id: `fire-${i}`, kind: "fire", label: fireCount > 1 ? `FIRE STATION ${i + 1}` : "FIRE STATION", polygon: footprint(u) });
  }

  // Military area at 25% of rich fields.
  if ((role === "major-hub" || role === "mega-hub") && rng.chance(0.25)) {
    const uMil = -(terminalSpanU[1] > 0 ? 1 : -1) * rng.float(0.55, 0.8) * uSpread;
    const label = rng.pick(["ANG RAMP", "USAF RESERVE"]);
    const militaryFootprint = (u: number) => [at(u - 480, -side * (networkW + 180)), at(u + 480, -side * (networkW + 180)), at(u + 480, -side * (networkW + 860)), at(u - 480, -side * (networkW + 860))];
    const safeUMil = slide([uMil, -uMil, uMil * 0.65, -uMil * 0.65], militaryFootprint, 200);
    if (clearOfRunways(militaryFootprint(safeUMil), 200)) {
      aprons.push({ id: "military-apron", kind: "military", label, polygon: [at(safeUMil - 420, -side * (networkW + 180)), at(safeUMil + 420, -side * (networkW + 180)), at(safeUMil + 420, -side * (networkW + 500)), at(safeUMil - 420, -side * (networkW + 500))] });
      standRow("military-apron", safeUMil, 420, networkW + 400, networkW + 250, -side, 150, "narrow", true);
      for (let i = 0; i < 2; i++) buildings.push({ id: `military-${i}`, kind: "military", label, unlabeled: true, polygon: rect(at(safeUMil - 180 + i * 360, -side * (networkW + 500 + 360 - 65)), 240, 130, -heading) });
      throats.push({ id: "military-throat", name: "", points: [at(safeUMil, -side * (networkW + 200)), at(safeUMil, -side * networkW)], width: 60, kind: "apron-throat", unlabeled: true });
    }
  }

  // Hold pads near the biggest runway's thresholds, past the parallel taxiway.
  if (hub) {
    const primary = runways[0]!;
    const [a, b] = runwayEndpoints(primary.center, primary.heading, primary.length);
    const labels = ["ILS HOLD", "CAT 2 HOLD", "PENALTY BOX"];
    [a, b].forEach((endpoint, i) => {
      if (!rng.chance(0.6)) return;
      const inward = polar(primary.heading + (i === 0 ? 0 : 180));
      const across = perp(inward);
      const centerW = primary.center.x * perp(polar(heading)).x + primary.center.y * perp(polar(heading)).y;
      const padSide = Math.sign(side * outerW - centerW) || 1;
      const centers = [500, 800, 1100].flatMap((inset) => [padSide, -padSide].map((candidateSide) => add(add(endpoint, scale(inward, inset)), scale(across, candidateSide * (design.runwayTaxiwaySeparation + 300)))));
      const center = centers.find((candidate) => clearOfRunways(rect(candidate, 300, 220, -primary.heading), 60));
      if (!center) return;
      const label = rng.chance(0.05) ? "SCENIC HOLD PAD" : labels[i % labels.length]!;
      aprons.push({ id: `hold-pad-${i}`, kind: "hold-pad", label, polygon: rect(center, 300, 220, -primary.heading) });
    });
  }

  // Towers: main near the core; extra at mega fields.
  const towerCount = role === "mega-hub" ? rng.int(2, 3) : 1;
  for (let i = 0; i < towerCount; i++) {
    const u0 = i === 0 ? (terminalSpanU[0] + terminalSpanU[1]) / 2 + rng.float(-500, 500) : rng.pick([-1, 1]) * rng.float(0.3, 0.6) * uSpread;
    const towerW = side * (networkW + 600 + rng.float(0, 300));
    const u = slide([u0, u0 + 700, u0 - 700, u0 + 1400, u0 - 1400], (candidate) => rect(at(candidate, towerW), 90, 90, -heading), 420);
    buildings.push({ id: `tower-${i}`, kind: "tower", label: "TWR", unlabeled: i > 0, polygon: rect(at(u, towerW), 90, 90, -heading) });
  }

  // Overflow apron named by compass position, long axis along the field.
  if (hub && rng.chance(0.6)) {
    const uOver0 = rng.pick([-1, 1]) * rng.float(0.35, 0.55) * uSpread;
    const footprint = (u: number) => [
      at(u - 320, -side * (networkW + 160)), at(u + 320, -side * (networkW + 160)),
      at(u + 320, -side * (networkW + 440)), at(u - 320, -side * (networkW + 440)),
    ];
    const uOver = slide([uOver0, -uOver0, uOver0 * 1.5, -uOver0 * 1.5], footprint, 100);
    const center = at(uOver, -side * (networkW + 300));
    if (clearOfRunways(footprint(uOver), 100)) {
      aprons.push({ id: "overflow", kind: "overflow", label: `${compassName(center)} RAMP`, polygon: footprint(uOver) });
      standRow("overflow", uOver, 320, networkW + 360, networkW + 220, -side, 150, "narrow", true);
      throats.push({ id: "overflow-throat", name: "", points: [at(uOver, -side * (networkW + 180)), at(uOver, -side * networkW)], width: 60, kind: "apron-throat", unlabeled: true });
    }
  }

  return { buildings, aprons, throats, terminal, stands, taxilanes };
}

function enforceBuildingFreeZones(buildings: Building[], zones: Point[][], heading: number): Building[] {
  const lateral = perp(polar(heading));
  return buildings.map((building) => {
    let polygon = building.polygon;
    for (let attempt = 0; attempt < 5; attempt++) {
      const center = polygon.reduce((sum, p) => ({ x: sum.x + p.x / polygon.length, y: sum.y + p.y / polygon.length }), { x: 0, y: 0 });
      const intrudes = zones.some((zone) => pointInPolygon(center, zone) || polygon.some((point) => pointInPolygon(point, zone)));
      if (!intrudes) break;
      const s = center.x * lateral.x + center.y * lateral.y >= 0 ? 1 : -1;
      polygon = polygon.map((point) => add(point, scale(lateral, s * 700)));
    }
    return { ...building, polygon };
  });
}

/** Hotspot derivation per harvest H4: risk-scored candidates with 500-ft suppression. */
function deriveHotspots(runways: Runway[], taxiways: Taxiway[], role: Role, rng: RNG): Hotspot[] {
  const open = runways.filter(isActive);
  type Candidate = { point: Point; risk: number; angle: number; reason: string; elongation: number };
  const candidates: Candidate[] = [];
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const [a1, b1] = runwayEndpoints(open[i]!.center, open[i]!.heading, open[i]!.length);
    const [a2, b2] = runwayEndpoints(open[j]!.center, open[j]!.heading, open[j]!.length);
    const hit = segmentIntersection(a1, b1, a2, b2);
    if (hit) candidates.push({ point: hit, risk: 3, angle: open[i]!.heading, reason: "RWY CROSSING", elongation: 1.4 });
  }
  for (const taxiway of taxiways.filter((t) => t.kind === "service")) {
    for (const runway of open) {
      const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
      for (let k = 0; k < taxiway.points.length - 1; k++) {
        const hit = segmentIntersection(taxiway.points[k]!, taxiway.points[k + 1]!, a, b);
        if (!hit) continue;
        const dEnds = Math.min(Math.hypot(hit.x - taxiway.points[k]!.x, hit.y - taxiway.points[k]!.y), Math.hypot(hit.x - taxiway.points[k + 1]!.x, hit.y - taxiway.points[k + 1]!.y));
        if (dEnds > 150) candidates.push({ point: hit, risk: 2, angle: runway.heading, reason: "TWY CROSSING", elongation: 1.15 });
      }
    }
  }
  for (const runway of open.slice(0, 2)) {
    const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
    for (const t of [0.04, 0.96]) candidates.push({ point: pointAlong(a, b, t), risk: 1, angle: runway.heading, reason: "THRESHOLD CLUSTER", elongation: 1.2 });
  }
  candidates.sort((one, two) => two.risk - one.risk);
  // Small GA fields usually chart no hot spots at all (KITH pattern).
  const limit = role === "mega-hub" ? rng.int(4, 7) : role === "major-hub" ? rng.int(3, 5) : role === "mid-hub" ? rng.int(2, 3) : role === "basic-ga" ? (rng.chance(0.35) ? 1 : 0) : rng.int(0, 2);
  const picked: Candidate[] = [];
  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    if (picked.some((p) => Math.hypot(p.point.x - candidate.point.x, p.point.y - candidate.point.y) < 500)) continue;
    picked.push(candidate);
  }
  return picked.map((candidate, index) => ({
    id: index + 1, point: candidate.point, rx: 300 * candidate.elongation, ry: 300 * 0.78,
    angle: candidate.angle, reason: candidate.reason,
  }));
}

/** LAHSO derivation per harvest H6 (deterministic). */
function deriveLahso(runways: Runway[]): LahsoMark[] {
  const open = runways.filter(isActive);
  const marks: LahsoMark[] = [];
  for (const runway of open) {
    if (runway.length < 8000) continue;
    const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
    for (const other of open) {
      if (other === runway) continue;
      const [c, d] = runwayEndpoints(other.center, other.heading, other.length);
      const hit = segmentIntersection(a, b, c, d);
      if (!hit) continue;
      for (const [from, to] of [[a, b], [b, a]] as const) {
        const landing = Math.hypot(hit.x - from.x, hit.y - from.y) - 250;
        const rest = Math.hypot(to.x - hit.x, to.y - hit.y);
        if (landing < 4500 || rest < 1500) continue;
        const direction = { x: (to.x - from.x) / runway.length, y: (to.y - from.y) / runway.length };
        const point = { x: from.x + direction.x * landing, y: from.y + direction.y * landing };
        if (marks.some((m) => Math.hypot(m.point.x - point.x, m.point.y - point.y) < 800)) continue;
        marks.push({ point, angle: runway.heading, runwayId: runway.id });
      }
    }
  }
  return marks.slice(0, 6);
}

const MONTH_INDEX: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

/** Julian revision date (YYDDD) derived from the cycle's effectivity start, so the
 * top-margin number is always a valid day-of-year that agrees with the side dates. */
function julianDate(cycle: string): string {
  const match = cycle.match(/(\d{2}) ([A-Z]{3}) (\d{4})/);
  if (!match) return "24001";
  const [, day, month, year] = match;
  const y = Number(year);
  const start = Date.UTC(y, MONTH_INDEX[month!] ?? 0, Number(day));
  const dayOfYear = Math.round((start - Date.UTC(y, 0, 1)) / 86400000) + 1;
  return `${String(y % 100).padStart(2, "0")}${String(dayOfYear).padStart(3, "0")}`;
}

/** fmtFreq per harvest H6: 2 dp, dropping to 1 dp when the hundredths digit is 0. */
function fmtFreq(value: number): string {
  const snapped = Math.round(value * 20) / 20;
  const twoDp = snapped.toFixed(2);
  return twoDp.endsWith("0") ? snapped.toFixed(1) : twoDp;
}

function buildFrequencies(role: Role, rng: RNG, city: string, runways: Runway[], heading: number, rampNames: string[]): { frequencies: Frequency[]; ramps: string[][] } {
  const draw = (low: number, high: number) => fmtFreq(rng.float(low, high));
  if (role === "basic-ga") {
    return { frequencies: [
      { label: "ASOS", value: `${draw(118, 121)} (${rng.int(200, 999)}-${rng.int(1000, 9999)})` },
      { label: "CTAF/UNICOM", value: draw(122.7, 123.05) },
    ], ramps: [] };
  }
  const hub = role.includes("hub");
  const cityCaps = city.toUpperCase();
  const rows: Frequency[] = [];
  const splitAtis = hub && rng.chance(0.3);
  if (splitAtis) rows.push({ label: "D-ATIS ARR", value: draw(118, 128.95) }, { label: "D-ATIS DEP", value: draw(118, 128.95) });
  else rows.push({ label: hub || rng.chance(0.25) ? "D-ATIS" : "ATIS", value: draw(118, 128.95) });
  if (hub && runways.length > 2) {
    // Sectored towers: sector names from the bank axis, runways chunked per sector.
    const vertical = heading < 45 || heading > 135;
    const sectors = vertical ? ["WEST", "EAST"] : ["NORTH", "SOUTH"];
    const half = Math.ceil(runways.length / 2);
    const chunks = [runways.slice(0, half), runways.slice(half)];
    sectors.forEach((sector, i) => {
      const list = chunks[i]!.filter(isActive).map((r) => `RWY ${r.id}`).join(", ");
      if (list) rows.push({ label: `${cityCaps} TOWER ${sector}`, value: draw(118, 128.95), detail: `(${list})` });
    });
  } else {
    rows.push({ label: `${cityCaps} TOWER`, value: draw(118, 128.95), partTime: !hub && rng.chance(0.3), detail: rng.chance(0.4) ? fmtFreq(rng.float(236, 299.95)) : undefined });
  }
  if (hub && rng.chance(0.6)) rows.push({ label: "GND CON", value: `${draw(121.6, 121.9)} ${draw(121.6, 121.9)}` }, { label: "GND METERING", value: draw(120, 134) });
  else rows.push({ label: "GND CON", value: draw(121.6, 121.9) });
  rows.push({ label: "CLNC DEL", value: draw(118, 135.95) });
  if (role === "major-hub" || role === "mega-hub") rows.push({ label: "CPDLC/PDC", value: "CLNC AVBL" });

  // Ramp table rows come from the ramps that actually exist on this sheet.
  const ramps: string[][] = [];
  if (hub) {
    const names = ["TERMINAL RAMP", ...rampNames.filter((name) => name !== "TERMINAL RAMP")].slice(0, 6);
    for (const name of names) ramps.push([name, fmtFreq(rng.float(129, 132.95))]);
    if (rng.chance(0.6)) ramps.push(["Snow and Ice", fmtFreq(rng.float(129, 132.95))]);
    ramps.push(["Non Movement Area", rng.pick(["131.375", "129.875", "130.575"])]);
  }
  return { frequencies: rows, ramps };
}

export function generate(seed: string, options: GenerateOptions = {}): SiteModel {
  const root = new RNG(seed || "TARMAC");
  const identityRng = root.derive("identity");
  const numbers = root.derive("numbers");
  const layout = root.derive("layout");

  const role = options.role ?? root.pick(ROLES);
  const identity = makeIdentity(identityRng, options.region, role);
  const design = designFor(role);
  const cfg = ROLE[role];
  const hub = role.includes("hub");

  // Wind axis from the full 0–180° range drives the whole layout orientation.
  const heading = layout.float(0, 180);
  const { at, axis, lateral } = frame(heading);

  // --- Runways (harvest H3) ---
  const altitudeBoost = Math.max(0, identity.elevation - 2000) * 0.18;
  const primaryLength = snap(Math.min(14000, layout.float(cfg.length[0], cfg.length[1]) + altitudeBoost), 50);
  const topologyRng = layout.derive("runway-topology");
  const mixedFamily = role === "mid-hub" ? topologyRng.chance(0.38)
    : role === "major-hub" ? topologyRng.chance(0.62)
      : role === "mega-hub" ? topologyRng.chance(0.72)
        : false;
  const secondaryCount = !mixedFamily ? 0 : role === "mega-hub" && topologyRng.chance(0.7) ? 2 : 1;
  const allSlots = bankSlots(role, layout.derive("bank"), primaryLength);
  // Mixed major fields keep a substantial primary bank, then spend the remaining
  // runway count on another wind family (MSP/ORD grammar rather than perpetual ATL).
  const primarySlotCount = secondaryCount === 0 ? allSlots.length : Math.max(2, allSlots.length - secondaryCount);
  const slots = allSlots.slice(0, primarySlotCount);
  const runways: Runway[] = [];
  const appendFamily = (familyHeading: number, familySlots: BankSlot[], familyName: string, origin: Point = { x: 0, y: 0 }): void => {
    const familyFrame = frame(familyHeading);
    // Renumbering: explicit bank groups when present (mega layouts), otherwise
    // four-plus parallels split into pairs (LAX/ATL pattern).
    let chunks: BankSlot[][];
    if (familySlots.some((slot) => slot.group !== undefined)) {
      const byGroup = new Map<number, BankSlot[]>();
      for (const slot of familySlots) {
        const key = slot.group ?? 0;
        if (!byGroup.has(key)) byGroup.set(key, []);
        byGroup.get(key)!.push(slot);
      }
      chunks = [...byGroup.values()];
    } else {
      chunks = familySlots.length >= 4 ? [familySlots.slice(0, 2), familySlots.slice(2)] : [familySlots];
    }
    const baseNumber = runwayNumber(familyHeading, identity.variation);
    chunks.forEach((chunk, chunkIndex) => {
      const number = ((baseNumber - 1 + chunkIndex) % 36) + 1;
      const suffixes = chunk.length === 1 ? [""] : chunk.length === 2 ? ["L", "R"] : ["L", "C", "R"];
      // Leftmost-first as seen by a pilot on the low-numbered approach.
      const ordered = chunk.slice().sort((one, two) => two.w - one.w);
      const lowFirst = number <= reciprocalNumber(number);
      ordered.forEach((slot, i) => {
        const runwayKey = familyName === "primary" ? `${chunkIndex}-${i}` : `${familyName}-${chunkIndex}-${i}`;
        const runwayRng = layout.derive(`runway-${runwayKey}`);
        const length = snap(Math.min(14000, primaryLength * slot.lengthScale), 50);
        const suffix = suffixes[lowFirst ? i : ordered.length - 1 - i] ?? "";
        const ends = makeEnds(runwayRng, identity, familyHeading, number, suffix, length);
        runways.push({
          id: `${ends[0].designator}-${ends[1].designator}`,
          center: add(origin, familyFrame.at(slot.u, slot.w)), heading: familyHeading, length,
          width: widthFor(length, familyName === "primary" && slot.lengthScale === 1),
          ends, slope: 0, lifecycle: "active",
          centerlineLights: design.visibility === "1200" && runwayRng.chance(0.75),
          pcn: pcnString(length, numbers.derive(`pcn-${runwayKey}`)),
        });
      });
    });
  };
  appendFamily(heading, slots, "primary");

  if (secondaryCount > 0) {
    const secondaryRng = topologyRng.derive("secondary-family");
    const delta = secondaryRng.pick([1, -1]) * secondaryRng.float(42, 82);
    const secondaryHeading = ((heading + delta) % 360 + 360) % 360;
    const crossingU = secondaryRng.pick([1, -1]) * secondaryRng.float(0.2, 0.34) * primaryLength;
    const origin = at(crossingU, secondaryRng.float(-0.04, 0.04) * primaryLength);
    const separation = secondaryCount === 2 ? secondaryRng.pick([700, 2400]) : 0;
    const secondarySlots: BankSlot[] = Array.from({ length: secondaryCount }, (_, index) => ({
      w: secondaryCount === 1 ? 0 : (index === 0 ? separation / 2 : -separation / 2),
      u: secondaryRng.float(-0.08, 0.08) * primaryLength,
      lengthScale: secondaryRng.float(role === "mega-hub" ? 0.72 : 0.62, role === "mid-hub" ? 0.82 : 0.92),
    }));
    appendFamily(secondaryHeading, secondarySlots, "secondary", origin);
  }

  // Crosswind runway: GA and windy regional fields; edge-placed, crossing outside
  // the primaries' middle thirds.
  const crossRng = layout.derive("crosswind");
  const wantsCross = (role === "basic-ga" && crossRng.chance(0.5)) || (role === "business-ga" && crossRng.chance(0.32)) || (role === "regional" && crossRng.chance(0.2));
  if (wantsCross) {
    const delta = crossRng.pick([1, -1]) * crossRng.float(35, 85);
    const crossHeading = ((heading + delta) % 360 + 360) % 360;
    const crossLength = snap(primaryLength * crossRng.float(0.55, 0.75), 50);
    const crossingU = crossRng.pick([1, -1]) * crossRng.float(0.24, 0.38) * primaryLength;
    const center = add(at(crossingU, 0), scale(polar(crossHeading), crossRng.float(-0.12, 0.12) * crossLength));
    const number = runwayNumber(crossHeading, identity.variation);
    const ends = makeEnds(crossRng.derive("ends"), identity, crossHeading, number, "", crossLength);
    runways.push({
      id: `${ends[0].designator}-${ends[1].designator}`,
      center, heading: crossHeading, length: crossLength,
      width: widthFor(crossLength, false), ends, slope: 0, lifecycle: "active",
      centerlineLights: false, pcn: pcnString(crossLength, numbers.derive("pcn-cross")),
    });
  }

  // Non-active former runway at legacy fields — never the primary. The lifecycle
  // state is drawn from a derived stream so it selects portrayal + retained data
  // without disturbing the layout draws.
  const legacyRng = layout.derive("legacy");
  if ((role === "regional" || role === "business-ga") && !wantsCross && legacyRng.chance(0.16)) {
    const delta = legacyRng.pick([1, -1]) * legacyRng.float(40, 85);
    const closedHeading = ((heading + delta) % 360 + 360) % 360;
    const closedLength = snap(primaryLength * legacyRng.float(0.5, 0.7), 50);
    const center = at(legacyRng.pick([1, -1]) * legacyRng.float(0.22, 0.34) * primaryLength, legacyRng.float(-400, 400));
    const lifecycle = legacyRng.derive("lifecycle").weighted<RunwayLifecycle>([
      ["closed-permanent", 0.4], ["removed", 0.3], ["closed-indefinite", 0.2], ["repurposed", 0.1],
    ]);
    // Indefinitely closed runways stay in the database and keep their end data.
    const keepsData = lifecycle === "closed-indefinite";
    const number = runwayNumber(closedHeading, identity.variation);
    const ends = keepsData
      ? makeEnds(legacyRng.derive("ends"), identity, closedHeading, number, "", closedLength)
      : ([
        { designator: "", elevation: identity.elevation, magneticHeading: 0, displaced: 0, blastPad: 0, emas: 0 },
        { designator: "", elevation: identity.elevation, magneticHeading: 0, displaced: 0, blastPad: 0, emas: 0 },
      ] as [RunwayEnd, RunwayEnd]);
    runways.push({
      id: `closed-${runways.length}`, center, heading: closedHeading, length: closedLength, width: 75,
      ends, slope: 0, lifecycle, centerlineLights: false, pcn: "",
    });
  }

  // Growing hubs occasionally chart a future parallel as a dotted new-construction
  // outline, outboard of the far bank (derived stream: no layout draws consumed).
  const expansionRng = layout.derive("expansion");
  if (hub && !runways.some((r) => !isActive(r)) && expansionRng.chance(0.07)) {
    const bankWsAll = runways.filter((r) => isActive(r) && Math.abs(((r.heading - heading) % 360)) < 1).map((r) => r.center.x * perp(polar(heading)).x + r.center.y * perp(polar(heading)).y);
    const w = Math.min(...bankWsAll) - expansionRng.pick([2500, 3400]);
    const length = snap(primaryLength * expansionRng.float(0.85, 1), 50);
    runways.push({
      id: `future-${runways.length}`, center: at(expansionRng.float(-0.06, 0.06) * primaryLength, w),
      heading, length, width: 150,
      ends: [
        { designator: "", elevation: identity.elevation, magneticHeading: 0, displaced: 0, blastPad: 0, emas: 0 },
        { designator: "", elevation: identity.elevation, magneticHeading: 0, displaced: 0, blastPad: 0, emas: 0 },
      ],
      slope: 0, lifecycle: "new-construction", centerlineLights: false, pcn: "",
    });
  }

  // Field elevation = highest point on a runway: force it onto the primary's higher end.
  for (const runway of runways) {
    if (!isActive(runway)) continue;
    runway.slope = Math.round(Math.abs(runway.ends[0].elevation - runway.ends[1].elevation) / runway.length * 1000) / 10;
  }
  const primary = runways[0]!;
  const higher = primary.ends[0].elevation >= primary.ends[1].elevation ? 0 : 1;
  primary.ends[higher].elevation = identity.elevation;
  primary.slope = Math.round(Math.abs(primary.ends[0].elevation - primary.ends[1].elevation) / primary.length * 1000) / 10;

  // --- Districts & taxiways ---
  const districtRng = layout.derive("districts");
  const side = districtRng.pick([1, -1]);
  const bankWs = runways.filter((r) => isActive(r) && Math.abs(((r.heading - heading) % 360)) < 1).map((r) => r.center.x * lateral.x + r.center.y * lateral.y);
  const outerBankW = side > 0 ? Math.max(...bankWs) : -Math.min(...bankWs);
  const networkW = outerBankW + design.runwayTaxiwaySeparation + (hub ? 400 : 0);
  const outerW = networkW + 120;
  const coreW = side * (outerW + 800);

  // The role supplies a prior; the terminal builder honors it only when the
  // program can fill it, so the model records the family actually built.
  const archetypePrior = terminalChoice(role, layout.derive("archetype"), options.archetype);
  const localFrame = (u: number, v: number): Point => ({ x: u, y: v });
  let complex = archetypePrior === "none" ? null : buildTerminal(districtRng.derive("morph"), role, archetypePrior, localFrame);

  // Parallel/midfield complexes exist ONLY between the runway banks, concourse
  // bars parallel to the runways (the ATL grammar). A site that cannot host the
  // midfield apron downgrades to pier — outboard parallel ranks are never drawn.
  // Mega-hub satellites also prefer the midfield gap (DEN pattern), outboard
  // otherwise.
  const fitGap = (): [number, number] | null => {
    if (!complex) return null;
    const sorted = bankWs.slice().sort((one, two) => one - two);
    let best: [number, number] | null = null;
    for (let i = 0; i + 1 < sorted.length; i++) {
      if (!best || sorted[i + 1]! - sorted[i]! > best[1] - best[0]) best = [sorted[i]!, sorted[i + 1]!];
    }
    if (best && complex.apronEdgeV / 2 + design.runwayTaxiwaySeparation + 150 <= (best[1] - best[0]) / 2) return best;
    return null;
  };
  let midfieldGap: [number, number] | null = null;
  const hasMixedRunwayFamilies = runways.some((runway) => isActive(runway) && Math.abs(runway.heading - heading) > 1);
  const midfieldEligible = complex !== null && !hasMixedRunwayFamilies && bankWs.length >= 2;
  if (midfieldEligible && (complex!.family === "parallel" || (role === "mega-hub" && complex!.family === "satellite"))) {
    midfieldGap = fitGap();
  }
  if (complex && complex.family === "parallel" && !midfieldGap) {
    complex = buildTerminal(districtRng.derive("morph"), role, "pier", localFrame);
  }
  const archetype = complex?.family ?? "none";
  const coreWEffective = midfieldGap ? (midfieldGap[0] + midfieldGap[1]) / 2 : coreW;

  // Only active runways carry runway protection zones. Zones are computed before
  // connectivity repair so repair corridors can route around them.
  const zones = protectionZones(runways.filter(isActive), design.visibility === "1200");

  const taxi = buildTaxiways(layout.derive("taxiways"), runways, role, design, coreWEffective);
  const districts = buildDistricts(districtRng, role, archetype, heading, primaryLength, side, outerW, networkW, design, runways, zones, complex, midfieldGap);
  taxi.taxiways.push(...districts.throats);
  repairConnectivity(taxi.taxiways, design.taxiwayWidth, zones, runways, heading);
  districts.aprons.push(...taxi.pads);

  // --- Parcel: hull of everything + margin, with clipped corners ---
  const contentPoints: Point[] = [
    ...runways.flatMap((r) => runwayEndpoints(r.center, r.heading, r.length)),
    ...zones.flat(),
    ...districts.buildings.flatMap((b) => b.polygon),
    ...districts.aprons.flatMap((a) => a.polygon),
    ...taxi.taxiways.flatMap((t) => t.points),
  ];
  const us = contentPoints.map((p) => p.x * axis.x + p.y * axis.y);
  const ws = contentPoints.map((p) => p.x * lateral.x + p.y * lateral.y);
  const margin = layout.float(700, 1100);
  const uMin = Math.min(...us) - margin; const uMax = Math.max(...us) + margin;
  const wMin = Math.min(...ws) - margin; const wMax = Math.max(...ws) + margin;
  const parcelRng = layout.derive("parcel");
  const clipA = parcelRng.chance(0.55) ? parcelRng.float(300, margin * 1.6) : 0;
  const clipB = parcelRng.chance(0.32) ? parcelRng.float(300, margin * 1.4) : 0;
  const parcel: Point[] = [
    at(uMin + clipA, wMin), at(uMax - clipB, wMin), at(uMax, wMin + clipB), at(uMax, wMax - clipA),
    at(uMax - clipA, wMax), at(uMin + clipB, wMax), at(uMin, wMax - clipB), at(uMin, wMin + clipA),
  ];

  const safeBuildings = enforceBuildingFreeZones(districts.buildings, zones, heading);
  const rampNames = districts.aprons
    .map((apron) => apron.label ?? "")
    .filter((label) => label.includes("RAMP"));
  const { frequencies, ramps } = buildFrequencies(role, numbers.derive("freqs"), identity.city, runways, heading, rampNames);

  // Beacon as a source fact: usually on the tower; otherwise a standalone site on
  // the landside belt, slid along the axis until it clears every runway corridor.
  const beaconRng = layout.derive("beacon");
  const tower = safeBuildings.find((b) => b.kind === "tower");
  let beacon: Beacon | null = null;
  if (tower) {
    const centroid = tower.polygon.reduce((sum, p) => ({ x: sum.x + p.x / tower.polygon.length, y: sum.y + p.y / tower.polygon.length }), { x: 0, y: 0 });
    if (beaconRng.chance(0.65)) beacon = { point: centroid, onTower: true };
    else {
      const clearOfAll = (p: Point): boolean => runways.every((r) => {
        const [ra, rb] = runwayEndpoints(r.center, r.heading, r.length);
        return pointSegmentDistance(p, ra, rb) > 600 + r.width / 2;
      });
      const beltW = networkW + 1400 + beaconRng.float(0, 400);
      const site = [0.35, -0.35, 0.55, -0.55, 0.75, -0.75]
        .map((f) => at(f * primaryLength / 2, side * beltW))
        .find(clearOfAll);
      beacon = site ? { point: site, onTower: false } : { point: centroid, onTower: true };
    }
  }

  // --- Role-gated located features and furniture families (Phase 4). ---
  // Spec B6: sprinkle, never all at once — a per-sheet cap trims the draw.
  const featureRng = layout.derive("features");
  const activeRunways = runways.filter(isActive);
  const commercial = role !== "basic-ga";
  const precision = design.visibility === "1200";

  for (const runway of activeRunways) {
    const isPrimary = runway === activeRunways[0];
    for (const end of runway.ends) {
      const als = precision && featureRng.chance(isPrimary ? 0.85 : 0.5)
        ? (runway.length > 10000 ? featureRng.pick(["ALSF-2", "SSALR"] as const) : "MALSR")
        : role === "regional" && featureRng.chance(0.4) ? featureRng.pick(["MALSR", "ODALS"] as const) : undefined;
      if (als) end.approachLights = als;
      if (featureRng.chance(commercial ? 0.8 : 0.45)) {
        end.vgsi = { kind: featureRng.chance(0.8) ? "PAPI" : "VASI", side: featureRng.chance(0.75) ? "L" : "R" };
      }
      if (!als && featureRng.chance(0.35)) end.reil = true;
    }
  }

  // Located symbols sit in open ground: clear of runway corridors, RPZs, and
  // every district apron/building footprint.
  const clearOfPolygon = (p: Point, polygon: Point[], margin: number): boolean => {
    if (pointInPolygon(p, polygon)) return false;
    for (let i = 0; i < polygon.length; i++) {
      if (pointSegmentDistance(p, polygon[i]!, polygon[(i + 1) % polygon.length]!) < margin) return false;
    }
    return true;
  };
  const clearPoint = (p: Point, margin: number): boolean => runways.every((r) => {
    const [ra, rb] = runwayEndpoints(r.center, r.heading, r.length);
    return pointSegmentDistance(p, ra, rb) > margin + r.width / 2;
  }) && zones.every((zone) => !pointInPolygon(p, zone))
    && districts.aprons.every((apron) => clearOfPolygon(p, apron.polygon, 180))
    && safeBuildings.every((building) => clearOfPolygon(p, building.polygon, 180));

  const wanted: string[] = [];
  const want = (name: string, p: number): void => { if (featureRng.chance(p)) wanted.push(name); };
  want("lighting-notes", commercial ? 0.7 : 0.45);
  want("declared-distances", hub ? 0.8 : role === "regional" ? 0.45 : 0);
  want("wind-cone", role === "basic-ga" || role === "business-ga" ? 0.9 : role === "regional" ? 0.5 : 0.15);
  want("helipad", hub ? 0.3 : role === "business-ga" ? 0.22 : 0.12);
  want("deice", hub ? 0.55 : role === "regional" ? 0.18 : 0);
  want("non-movement", 0.25);
  want("hotspot-table", hub ? 0.6 : 0.3);
  const families = new Set(featureRng.shuffle(wanted).slice(0, hub ? 4 : 3));

  const lightingNotes: string[] = [];
  if (families.has("lighting-notes")) {
    if (featureRng.chance(0.55) || activeRunways.length === 1) lightingNotes.push("HIRL ALL RWYS");
    else {
      lightingNotes.push(`HIRL RWY ${activeRunways[0]!.id}`);
      if (activeRunways[1]) lightingNotes.push(`MIRL RWY ${activeRunways[1]!.id}`);
    }
    const reils = activeRunways.flatMap((r) => r.ends.filter((end) => end.reil).map((end) => end.designator)).filter(Boolean);
    if (reils.length > 0) lightingNotes.push(`REIL RWY${reils.length > 1 ? "S" : ""} ${reils.slice(0, 3).join(" AND ")}`);
    if (activeRunways.some((r) => r.centerlineLights)) lightingNotes.push(`CL RWY ${activeRunways.find((r) => r.centerlineLights)!.id}`);
  }

  let windCone: SiteModel["windCone"] = null;
  if (families.has("wind-cone")) {
    const site = [0.3, -0.3, 0.45, -0.45, 0.6].map((f) => at(f * primaryLength / 2, side * (networkW + 700)))
      .find((p) => clearPoint(p, 400));
    if (site) windCone = { point: site, segmentedCircle: role === "basic-ga" ? featureRng.chance(0.8) : featureRng.chance(0.25) };
  }

  const helipads: Point[] = [];
  if (families.has("helipad")) {
    const site = [0.5, -0.5, 0.66, -0.66].map((f) => at(f * primaryLength / 2, side * (networkW + 950)))
      .find((p) => clearPoint(p, 500));
    if (site) helipads.push(site);
  }

  if (families.has("deice")) {
    // Deice pads sit on departure routes: beside the parallel near a primary end.
    const primaryRunway = activeRunways[0]!;
    const [pa, pb] = runwayEndpoints(primaryRunway.center, primaryRunway.heading, primaryRunway.length);
    const inwardFrom = (endpoint: Point, other: Point): Point => ({ x: (other.x - endpoint.x) / primaryRunway.length, y: (other.y - endpoint.y) / primaryRunway.length });
    [[pa, pb], [pb, pa]].slice(0, featureRng.chance(0.5) ? 2 : 1).forEach(([endpoint, other], i) => {
      const inward = inwardFrom(endpoint!, other!);
      const lateral = perp(inward);
      const centerCandidates = [1, -1].map((s) => add(add(endpoint!, scale(inward, 1500)), scale(lateral, s * (design.runwayTaxiwaySeparation + 520))));
      const center = centerCandidates.find((p) => clearPoint(p, 320));
      if (!center) return;
      const pad = rect(center, 520, 300, -primaryRunway.heading);
      if (!zones.some((zone) => pad.some((p) => pointInPolygon(p, zone)))) {
        districts.aprons.push({ id: `deice-${i}`, kind: "deice", label: "DEICE PAD", polygon: pad });
      }
    });
  }

  const nonMovementApronIds: string[] = [];
  if (families.has("non-movement")) {
    const candidatesNM = districts.aprons.filter((apron) => apron.kind === "ga" || apron.kind === "cargo" || apron.kind === "overflow");
    if (candidatesNM.length > 0) nonMovementApronIds.push(candidatesNM[0]!.id);
  }

  const closedStates = new Set<RunwayLifecycle>(["closed-indefinite", "closed-permanent", "removed"]);
  const cautions = [
    "CAUTION: BE ALERT TO RUNWAY CROSSING CLEARANCES.",
    "READBACK OF ALL RUNWAY HOLDING INSTRUCTIONS IS REQUIRED.",
  ];
  if (runways.some((r) => closedStates.has(r.lifecycle))) cautions.push("CAUTION: CLOSED RWY NOT AVBL FOR LDG OR DEP.");
  const notes: string[] = [];
  if (hub) notes.push("ASDE-X SURVEILLANCE SYSTEM IN USE.");
  if ((role === "major-hub" || role === "mega-hub") && numbers.chance(0.6)) notes.push("RUNWAY STATUS LIGHTS IN OPERATION.");

  return {
    seed, identity, role, design, windHeading: heading, parcel, protectionZones: zones, runways,
    taxiways: taxi.taxiways, holdLines: taxi.holds, aprons: districts.aprons, buildings: safeBuildings,
    beacon,
    terminal: districts.terminal,
    stands: districts.stands,
    taxilanes: districts.taxilanes,
    hotspots: deriveHotspots(runways, taxi.taxiways, role, layout.derive("hotspots")),
    lahso: deriveLahso(runways),
    frequencies, rampFrequencies: ramps, cautions, notes,
    lightingNotes,
    declaredDistances: families.has("declared-distances"),
    windCone, helipads, nonMovementApronIds,
    hotspotTable: families.has("hotspot-table"),
    terminalArchetype: archetype,
    chartNumber: julianDate(identity.cycle), alNumber: `AL-${numbers.int(1, 999)} (FAA)`,
    cycle: identity.cycle,
  };
}
