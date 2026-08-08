import { RNG } from "./rng";
import { add, perp, pointAlong, pointInPolygon, pointSegmentDistance, polar, polylineDistance, rect, runwayEndpoints, scale, segmentIntersection, sub } from "./geometry";
import { makeIdentity } from "./identity";
import { buildTerminal, type TerminalComplex } from "./terminal";
import type { Apron, Building, DesignCode, Frequency, GenerateOptions, HoldLine, Hotspot, Identity, LahsoMark, Point, Role, Runway, RunwayEnd, SiteModel, Taxiway, TerminalArchetype } from "./types";

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

interface BankSlot { w: number; u: number; lengthScale: number; }

function bankSlots(role: Role, rng: RNG, primaryLength: number): BankSlot[] {
  const stagger = () => rng.float(-0.15, 0.15) * primaryLength;
  switch (role) {
    case "basic-ga": return [{ w: 0, u: 0, lengthScale: 1 }];
    case "business-ga":
      return rng.chance(0.22)
        ? [{ w: 0, u: 0, lengthScale: 1 }, { w: -700, u: stagger(), lengthScale: rng.float(0.6, 0.75) }]
        : [{ w: 0, u: 0, lengthScale: 1 }];
    case "regional": {
      const sep = rng.pick([700, 2500]);
      return [{ w: sep / 2, u: 0, lengthScale: 1 }, { w: -sep / 2, u: stagger(), lengthScale: rng.float(0.72, 0.95) }];
    }
    case "mid-hub": return [{ w: 1250, u: 0, lengthScale: 1 }, { w: -1250, u: stagger(), lengthScale: rng.float(0.8, 0.95) }];
    case "major-hub": return [
      { w: 2500, u: 0, lengthScale: 1 },
      { w: 0, u: stagger(), lengthScale: rng.float(0.85, 1) },
      { w: -2500, u: stagger(), lengthScale: rng.float(0.8, 0.92) },
    ];
    case "mega-hub": {
      const gap = rng.pick([3900, 5200]);
      return [
        { w: gap / 2 + 700, u: stagger(), lengthScale: rng.float(0.85, 0.95) },
        { w: gap / 2, u: 0, lengthScale: 1 },
        { w: -gap / 2, u: stagger(), lengthScale: rng.float(0.9, 1) },
        { w: -gap / 2 - 700, u: stagger(), lengthScale: rng.float(0.8, 0.9) },
      ];
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

function makeEnds(rng: RNG, identity: Identity, heading: number, number: number, suffix: string, big: boolean): [RunwayEnd, RunwayEnd] {
  const mirror = (s: string) => (s === "L" ? "R" : s === "R" ? "L" : s);
  const makeEnd = (designator: string, mag: number): RunwayEnd => {
    const emas = big && rng.chance(0.2) ? snap(rng.float(300, 600), 50) : 0;
    return {
      designator,
      elevation: Math.round(identity.elevation - Math.abs(rng.gauss(0, 7))),
      magneticHeading: Math.round((((mag % 360) + 360) % 360) * 10) / 10,
      displaced: rng.chance(0.22) ? snap(rng.float(200, 900), 50) : 0,
      blastPad: !emas && rng.chance(0.28) ? snap(rng.float(200, 1000), 100) : 0,
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

/** Taxiway solver per harvest H4: parallels with threshold jogs, connector stations,
 * high-speed exits landing on the parallel, crossfield spines, letters assigned by
 * descending path length, connectors numbered from the canonical axis end. */
function buildTaxiways(rng: RNG, runways: Runway[], role: Role, design: DesignCode, coreW: number): { taxiways: Taxiway[]; holds: HoldLine[] } {
  const routes: TaxiRoute[] = [];
  const holds: HoldLine[] = [];
  const hub = role.includes("hub");
  const open = runways.filter((r) => !r.closed);

  open.forEach((runway, runwayIndex) => {
    const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
    const runAxis = polar(runway.heading);
    const runLateral = perp(runAxis);
    const centerW = runway.center.x * runLateral.x + runway.center.y * runLateral.y;
    const side = Math.sign(coreW - centerW) || 1;
    const separation = design.runwayTaxiwaySeparation;
    const jog = rng.float(50, 100);
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
    // Dual parallel between the primary and the terminal at busy fields.
    if (hub && runwayIndex === 0) {
      routes.push({
        kind: "parallel", runwayId: runway.id, width: design.taxiwayWidth,
        points: [
          add(pointAlong(a, b, 0.05), scale(runLateral, side * (separation + 400))),
          add(pointAlong(a, b, 0.95), scale(runLateral, side * (separation + 400))),
        ],
      });
    }

    // Connector stations: thresholds always, middle 18–82% with ±3% jitter (harvest H4).
    const midCount = Math.max(1, Math.min(5, Math.round(runway.length / 2400) - (role === "basic-ga" ? 1 : 0)));
    const stations = [0.015, 0.985];
    for (let i = 0; i < midCount; i++) stations.push(0.18 + (0.64 * (i + 0.5)) / midCount + rng.float(-0.03, 0.03));
    stations.sort((x, y) => x - y);
    const canonical = Math.abs(runAxis.x) >= Math.abs(runAxis.y) ? (runAxis.x >= 0 ? 1 : -1) : (runAxis.y >= 0 ? 1 : -1);
    stations.forEach((t) => {
      const runwayPoint = pointAlong(a, b, t);
      const jogHere = t < jogT || t > 1 - jogT ? jog : 0;
      const taxiPoint = add(runwayPoint, scale(runLateral, side * (separation + jogHere)));
      routes.push({
        kind: "connector", runwayId: runway.id, width: design.taxiwayWidth,
        points: [runwayPoint, taxiPoint], parentRoute: parallelIndex,
        connectorStation: canonical > 0 ? t : 1 - t,
      });
      holds.push({ point: add(runwayPoint, scale(runLateral, side * design.holdDistance)), angle: runway.heading, taxiwayName: "", runwayId: runway.id, kind: design.visibility === "1200" && (t < 0.05 || t > 0.95) ? "ils" : undefined });
    });

    // High-speed exits: 30° off, starting 58–68% down in the landing direction,
    // run length separation/tan(30°) so the exit lands exactly on the parallel.
    if (runway.length >= 9000) {
      for (const dir of [1, -1] as const) {
        const t0 = rng.float(0.58, 0.68);
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

  // Letters by descending path length (A is always the longest parallel), then
  // connector stubs <letter><digit> numbered from the canonical axis end.
  const pathLength = (points: Point[]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);
  const lettered = routes.map((route, index) => ({ route, index })).filter(({ route }) => route.kind === "parallel" || route.kind === "service");
  lettered.sort((one, two) => pathLength(two.route.points) - pathLength(one.route.points));
  const names = new Map<number, string>();
  lettered.forEach(({ index }, i) => names.set(index, TAXI_LETTERS[i % TAXI_LETTERS.length]!));
  const byParent = new Map<number, { index: number; station: number }[]>();
  routes.forEach((route, index) => {
    if (route.parentRoute === undefined) return;
    if (!byParent.has(route.parentRoute)) byParent.set(route.parentRoute, []);
    byParent.get(route.parentRoute)!.push({ index, station: route.connectorStation ?? 0 });
  });
  for (const [parent, children] of byParent) {
    const letter = names.get(parent) ?? "Z";
    children.sort((one, two) => one.station - two.station);
    children.forEach(({ index }, i) => names.set(index, `${letter}${Math.min(9, i + 1)}`));
  }

  const taxiways: Taxiway[] = routes.map((route, index) => ({
    id: `twy-${index}`,
    name: names.get(index) ?? "Z9",
    points: route.points,
    width: route.width,
    kind: route.kind,
    runwayId: route.runwayId,
    unlabeled: route.unlabeled,
  }));
  return { taxiways, holds };
}

/** Rng-free connectivity repair (harvest H4): union-find over taxiways, then bridge
 * the two largest components with straight links until one component remains. */
function repairConnectivity(taxiways: Taxiway[], width: number): void {
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
    const [big, next] = [sorted[0]!, sorted[1]!];
    let best: { a: Point; b: Point; d: number } | null = null;
    for (const i of big) for (const j of next) {
      for (const p of taxiways[i]!.points) for (const q of taxiways[j]!.points) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (!best || d < best.d) best = { a: p, b: q, d };
      }
    }
    if (!best) return;
    taxiways.push({ id: `repair-${pass}`, name: `Z${Math.min(9, pass + 1)}`, points: [best.a, best.b], width, kind: "service", unlabeled: false });
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

interface Districts { buildings: Building[]; aprons: Apron[]; throats: Taxiway[]; }

/** District & facility zoo per harvest H5 cluster recipes. */
function buildDistricts(rng: RNG, role: Role, archetype: TerminalArchetype, heading: number, primaryLength: number, side: number, outerW: number, networkW: number, design: DesignCode, runways: Runway[], complex: TerminalComplex | null, midfieldGap: [number, number] | null): Districts {
  const { at } = frame(heading);
  const ga = ROLE[role].ga;
  const hub = role.includes("hub");
  const buildings: Building[] = [];
  const aprons: Apron[] = [];
  const throats: Taxiway[] = [];
  const wAt = (w: number) => side * w;
  const uSpread = primaryLength / 2;
  const open = runways.filter((r) => !r.closed);
  // Sliding-search helper (harvest H5): first candidate whose keypoints all clear
  // every runway centerline by the hard margin wins.
  const clearOfRunways = (points: Point[], margin: number): boolean =>
    points.every((p) => open.every((r) => {
      const [ra, rb] = runwayEndpoints(r.center, r.heading, r.length);
      return pointSegmentDistance(p, ra, rb) >= margin + r.width / 2;
    }));
  const slide = (candidates: number[], keypoints: (u: number) => Point[], margin = 520): number =>
    candidates.find((u) => clearOfRunways(keypoints(u), margin)) ?? candidates[0]!;

  let terminalSpanU: [number, number] = [0, 0];
  if (complex) {
    const uTerm = rng.float(-0.18, 0.18) * primaryLength;
    if (midfieldGap) {
      // Midfield complex between the runway banks (ATL/DEN pattern).
      const mid = (midfieldGap[0] + midfieldGap[1]) / 2;
      const toWorld = (p: Point) => at(uTerm + p.x, mid + side * (p.y - complex.apronEdgeV / 2));
      for (const building of complex.buildings) buildings.push({ ...building, polygon: building.polygon.map(toWorld) });
      for (const apron of complex.aprons) aprons.push({ ...apron, polygon: apron.polygon.map(toWorld) });
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
      [uGA0, uGA0 - 0.2 * primaryLength, uGA0 + 0.2 * primaryLength, uGA0 - 0.38 * primaryLength, uGA0 + 0.38 * primaryLength],
      (u) => [at(u - halfLen, gaSide * gaW), at(u + halfLen, gaSide * gaW), at(u - halfLen, gaSide * (gaW + clusterDepth)), at(u + halfLen, gaSide * (gaW + clusterDepth)), at(u, gaSide * (gaW + clusterDepth / 2))],
      300,
    );
    aprons.push({
      id: "ga-apron", kind: "ga", label: "GENERAL AVIATION PARKING", tieDowns: true,
      polygon: [at(uGA - halfLen, gaSide * gaW), at(uGA + halfLen, gaSide * gaW), at(uGA + halfLen, gaSide * (gaW + depth)), at(uGA - halfLen, gaSide * (gaW + depth))],
    });
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

  // Cargo campus, apart from the terminal, compass-8 named.
  if (role !== "basic-ga") {
    const uCargo0 = (terminalSpanU[1] > 0 ? 1 : -1) * rng.float(0.6, 0.85) * uSpread * (rng.chance(0.75) ? 1 : -1);
    const cargoSide = Math.abs(uCargo0) > Math.abs(terminalSpanU[1]) + 900 || archetype === "none" ? side : -side;
    const half = 320 + ga * 220;
    const uCargo = slide(
      [uCargo0, uCargo0 - 0.18 * primaryLength, uCargo0 + 0.18 * primaryLength, uCargo0 - 0.34 * primaryLength, uCargo0 + 0.34 * primaryLength],
      (u) => [at(u - half, cargoSide * (networkW + 170)), at(u + half, cargoSide * (networkW + 170)), at(u - half, cargoSide * (networkW + 810)), at(u + half, cargoSide * (networkW + 810))],
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
    throats.push({ id: "cargo-throat", name: "", points: [at(uCargo, cargoSide * (networkW + 200)), at(uCargo, cargoSide * networkW)], width: 60, kind: "apron-throat", unlabeled: true });
  }

  // Fuel farm: 2×2 grid of tanks, labeled once.
  {
    const uFuel0 = rng.pick([-1, 1]) * rng.float(0.85, 1) * uSpread;
    const uFuel = slide([uFuel0, -uFuel0, uFuel0 * 0.7, -uFuel0 * 0.7], (u) => [at(u, side * (networkW + 420)), at(u + 140, side * (networkW + 560))], 300);
    for (let i = 0; i < 4; i++) {
      buildings.push({ id: `fuel-${i}`, kind: "fuel", label: "FUEL FARM", unlabeled: i > 0, polygon: rect(at(uFuel + (i % 2) * 140 - 70, side * (networkW + 420 + Math.floor(i / 2) * 140)), 100, 100, -heading) });
    }
  }

  // Fire stations spread along the field, alternating sides.
  const fireCount = hub ? rng.int(2, 4) : 1;
  for (let i = 0; i < fireCount; i++) {
    const u0 = [(-0.9) * uSpread * 0.6, 0.15 * uSpread, 0.9 * uSpread * 0.7, -0.4 * uSpread][i]!;
    const fireSide = i % 2 === 0 ? side : -side;
    const u = slide([u0, u0 + 0.15 * primaryLength, u0 - 0.15 * primaryLength], (candidate) => [at(candidate, fireSide * (networkW + 260))], 420);
    buildings.push({ id: `fire-${i}`, kind: "fire", label: fireCount > 1 ? `FIRE STATION ${i + 1}` : "FIRE STATION", polygon: rect(at(u, fireSide * (networkW + 260)), 180, 130, -heading) });
  }

  // Military area at 25% of rich fields.
  if ((role === "major-hub" || role === "mega-hub") && rng.chance(0.25)) {
    const uMil = -(terminalSpanU[1] > 0 ? 1 : -1) * rng.float(0.55, 0.8) * uSpread;
    const label = rng.pick(["ANG RAMP", "USAF RESERVE"]);
    aprons.push({ id: "military-apron", kind: "military", label, polygon: [at(uMil - 420, -side * (networkW + 180)), at(uMil + 420, -side * (networkW + 180)), at(uMil + 420, -side * (networkW + 500)), at(uMil - 420, -side * (networkW + 500))] });
    for (let i = 0; i < 2; i++) buildings.push({ id: `military-${i}`, kind: "military", label, unlabeled: true, polygon: rect(at(uMil - 180 + i * 360, -side * (networkW + 500 + 360 - 65)), 240, 130, -heading) });
    throats.push({ id: "military-throat", name: "", points: [at(uMil, -side * (networkW + 200)), at(uMil, -side * networkW)], width: 60, kind: "apron-throat", unlabeled: true });
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
      const center = add(add(endpoint, scale(inward, 500)), scale(across, padSide * (design.runwayTaxiwaySeparation + 300)));
      const label = rng.chance(0.05) ? "SCENIC HOLD PAD" : labels[i % labels.length]!;
      aprons.push({ id: `hold-pad-${i}`, kind: "hold-pad", label, polygon: rect(center, 300, 220, -primary.heading) });
    });
  }

  // Towers: main near the core; extra at mega fields.
  const towerCount = role === "mega-hub" ? rng.int(2, 3) : 1;
  for (let i = 0; i < towerCount; i++) {
    const u0 = i === 0 ? (terminalSpanU[0] + terminalSpanU[1]) / 2 + rng.float(-500, 500) : rng.pick([-1, 1]) * rng.float(0.3, 0.6) * uSpread;
    const towerW = side * (networkW + 600 + rng.float(0, 300));
    const u = slide([u0, u0 + 700, u0 - 700], (candidate) => [at(candidate, towerW)], 420);
    buildings.push({ id: `tower-${i}`, kind: "tower", label: "TWR/BCN", unlabeled: i > 0, polygon: rect(at(u, towerW), 90, 90, -heading) });
  }

  // Overflow apron named by compass position.
  if (hub && rng.chance(0.6)) {
    const uOver = rng.pick([-1, 1]) * rng.float(0.35, 0.55) * uSpread;
    const center = at(uOver, -side * (networkW + 300));
    aprons.push({ id: "overflow", kind: "overflow", label: `${compassName(center)} RAMP`, polygon: rect(center, 640, 280, -heading) });
    throats.push({ id: "overflow-throat", name: "", points: [at(uOver, -side * (networkW + 180)), at(uOver, -side * networkW)], width: 60, kind: "apron-throat", unlabeled: true });
  }

  return { buildings, aprons, throats };
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
  const open = runways.filter((r) => !r.closed);
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
  const limit = role === "mega-hub" ? rng.int(4, 7) : role === "major-hub" ? rng.int(3, 5) : role === "mid-hub" ? rng.int(2, 3) : role === "basic-ga" ? 1 : rng.int(1, 2);
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
  const open = runways.filter((r) => !r.closed);
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

/** fmtFreq per harvest H6: 2 dp, dropping to 1 dp when the hundredths digit is 0. */
function fmtFreq(value: number): string {
  const snapped = Math.round(value * 20) / 20;
  const twoDp = snapped.toFixed(2);
  return twoDp.endsWith("0") ? snapped.toFixed(1) : twoDp;
}

function buildFrequencies(role: Role, rng: RNG, city: string, runways: Runway[], heading: number): { frequencies: Frequency[]; ramps: string[][] } {
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
      const list = chunks[i]!.filter((r) => !r.closed).map((r) => `RWY ${r.id}`).join(", ");
      if (list) rows.push({ label: `${cityCaps} TOWER ${sector}`, value: draw(118, 128.95), detail: `(${list})` });
    });
  } else {
    rows.push({ label: `${cityCaps} TOWER`, value: draw(118, 128.95), partTime: !hub && rng.chance(0.3), detail: rng.chance(0.4) ? fmtFreq(rng.float(236, 299.95)) : undefined });
  }
  if (hub && rng.chance(0.6)) rows.push({ label: "GND CON", value: `${draw(121.6, 121.9)} ${draw(121.6, 121.9)}` }, { label: "GND METERING", value: draw(120, 134) });
  else rows.push({ label: "GND CON", value: draw(121.6, 121.9) });
  rows.push({ label: "CLNC DEL", value: draw(118, 135.95) });
  if (role === "major-hub" || role === "mega-hub") rows.push({ label: "CPDLC/PDC", value: "CLNC AVBL" });

  const ramps: string[][] = [];
  if (hub) {
    const count = rng.int(3, 6);
    const names = ["TERMINAL RAMP", "NORTH RAMP", "SOUTH RAMP", "EAST RAMP", "WEST RAMP", "CARGO RAMP", "INTL RAMP"];
    for (const name of rng.shuffle(names).slice(0, count)) ramps.push([name, fmtFreq(rng.float(129, 132.95))]);
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
  const identity = makeIdentity(identityRng, options.region);
  const design = designFor(role);
  const cfg = ROLE[role];
  const hub = role.includes("hub");

  // Wind axis from the full 0–180° range drives the whole layout orientation.
  const heading = layout.float(0, 180);
  const { at, axis, lateral } = frame(heading);

  // --- Runways (harvest H3) ---
  const altitudeBoost = Math.max(0, identity.elevation - 2000) * 0.18;
  const primaryLength = snap(Math.min(14000, layout.float(cfg.length[0], cfg.length[1]) + altitudeBoost), 50);
  const slots = bankSlots(role, layout.derive("bank"), primaryLength);

  // Group into number chunks: 4+ parallels renumber in chunks of 2 (LAX/ATL pattern).
  const baseNumber = runwayNumber(heading, identity.variation);
  const chunks: BankSlot[][] = slots.length >= 4
    ? [slots.slice(0, 2), slots.slice(2)]
    : [slots];

  const runways: Runway[] = [];
  chunks.forEach((chunk, chunkIndex) => {
    const number = ((baseNumber - 1 + chunkIndex) % 36) + 1;
    const suffixes = chunk.length === 1 ? [""] : chunk.length === 2 ? ["L", "R"] : ["L", "C", "R"];
    // Leftmost-first as seen by a pilot on the low-numbered approach: our lateral
    // axis is the pilot's left when flying the primary heading.
    const ordered = chunk.slice().sort((one, two) => two.w - one.w);
    const lowFirst = number <= reciprocalNumber(number);
    ordered.forEach((slot, i) => {
      const runwayRng = layout.derive(`runway-${chunkIndex}-${i}`);
      const length = snap(Math.min(14000, primaryLength * slot.lengthScale), 50);
      const suffix = suffixes[lowFirst ? i : ordered.length - 1 - i] ?? "";
      const ends = makeEnds(runwayRng, identity, heading, number, suffix, length > 9000);
      runways.push({
        id: `${ends[0].designator}-${ends[1].designator}`,
        center: at(slot.u, slot.w), heading, length,
        width: widthFor(length, slot.lengthScale === 1),
        ends, slope: 0,
        centerlineLights: design.visibility === "1200" && runwayRng.chance(0.75),
        pcn: pcnString(length, numbers.derive(`pcn-${chunkIndex}-${i}`)),
      });
    });
  });

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
    const ends = makeEnds(crossRng.derive("ends"), identity, crossHeading, number, "", false);
    runways.push({
      id: `${ends[0].designator}-${ends[1].designator}`,
      center, heading: crossHeading, length: crossLength,
      width: widthFor(crossLength, false), ends, slope: 0,
      centerlineLights: false, pcn: pcnString(crossLength, numbers.derive("pcn-cross")),
    });
  }

  // Closed former runway at legacy fields — never the primary.
  const legacyRng = layout.derive("legacy");
  if ((role === "regional" || role === "business-ga") && !wantsCross && legacyRng.chance(0.16)) {
    const delta = legacyRng.pick([1, -1]) * legacyRng.float(40, 85);
    const closedHeading = ((heading + delta) % 360 + 360) % 360;
    const closedLength = snap(primaryLength * legacyRng.float(0.5, 0.7), 50);
    const center = at(legacyRng.pick([1, -1]) * legacyRng.float(0.22, 0.34) * primaryLength, legacyRng.float(-400, 400));
    runways.push({
      id: `closed-${runways.length}`, center, heading: closedHeading, length: closedLength, width: 75,
      ends: [
        { designator: "", elevation: identity.elevation, magneticHeading: 0, displaced: 0, blastPad: 0, emas: 0 },
        { designator: "", elevation: identity.elevation, magneticHeading: 0, displaced: 0, blastPad: 0, emas: 0 },
      ],
      slope: 0, closed: true, centerlineLights: false, pcn: "",
    });
  }

  // Field elevation = highest point on a runway: force it onto the primary's higher end.
  for (const runway of runways) {
    if (runway.closed) continue;
    runway.slope = Math.round(Math.abs(runway.ends[0].elevation - runway.ends[1].elevation) / runway.length * 1000) / 10;
  }
  const primary = runways[0]!;
  const higher = primary.ends[0].elevation >= primary.ends[1].elevation ? 0 : 1;
  primary.ends[higher].elevation = identity.elevation;
  primary.slope = Math.round(Math.abs(primary.ends[0].elevation - primary.ends[1].elevation) / primary.length * 1000) / 10;

  // --- Districts & taxiways ---
  const districtRng = layout.derive("districts");
  const side = districtRng.pick([1, -1]);
  const bankWs = runways.filter((r) => !r.closed && Math.abs(((r.heading - heading) % 360)) < 1).map((r) => r.center.x * lateral.x + r.center.y * lateral.y);
  const outerBankW = side > 0 ? Math.max(...bankWs) : -Math.min(...bankWs);
  const networkW = outerBankW + design.runwayTaxiwaySeparation + (hub ? 400 : 0);
  const outerW = networkW + 120;
  const coreW = side * (outerW + 800);

  const archetype = terminalChoice(role, layout.derive("archetype"), options.archetype);
  const complex = archetype === "none" ? null : buildTerminal(districtRng.derive("morph"), role, archetype, (u, v) => ({ x: u, y: v }));

  // Mega-hub parallel/satellite complexes go midfield between the banks when the
  // largest bank gap can hold the apron (ATL/DEN pattern); otherwise outboard.
  let midfieldGap: [number, number] | null = null;
  if (complex && role === "mega-hub" && (archetype === "parallel" || archetype === "satellite")) {
    const sorted = bankWs.slice().sort((one, two) => one - two);
    let best: [number, number] | null = null;
    for (let i = 0; i + 1 < sorted.length; i++) {
      if (!best || sorted[i + 1]! - sorted[i]! > best[1] - best[0]) best = [sorted[i]!, sorted[i + 1]!];
    }
    if (best && complex.apronEdgeV / 2 + design.runwayTaxiwaySeparation + 150 <= (best[1] - best[0]) / 2) midfieldGap = best;
  }
  const coreWEffective = midfieldGap ? (midfieldGap[0] + midfieldGap[1]) / 2 : coreW;

  const taxi = buildTaxiways(layout.derive("taxiways"), runways, role, design, coreWEffective);
  const districts = buildDistricts(districtRng, role, archetype, heading, primaryLength, side, outerW, networkW, design, runways, complex, midfieldGap);
  taxi.taxiways.push(...districts.throats);
  repairConnectivity(taxi.taxiways, design.taxiwayWidth);

  // --- Parcel: hull of everything + margin, with clipped corners ---
  const zones = protectionZones(runways, design.visibility === "1200");
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
  const { frequencies, ramps } = buildFrequencies(role, numbers.derive("freqs"), identity.city, runways, heading);

  const cautions = [
    "CAUTION: BE ALERT TO RUNWAY CROSSING CLEARANCES.",
    "READBACK OF ALL RUNWAY HOLDING INSTRUCTIONS IS REQUIRED.",
  ];
  if (runways.some((r) => r.closed)) cautions.push("CAUTION: CLOSED RWY NOT AVBL FOR LDG OR DEP.");
  const notes: string[] = [];
  if (hub) notes.push("ASDE-X SURVEILLANCE SYSTEM IN USE.");
  if ((role === "major-hub" || role === "mega-hub") && numbers.chance(0.6)) notes.push("RUNWAY STATUS LIGHTS IN OPERATION.");

  return {
    seed, identity, role, design, windHeading: heading, parcel, protectionZones: zones, runways,
    taxiways: taxi.taxiways, holdLines: taxi.holds, aprons: districts.aprons, buildings: safeBuildings,
    hotspots: deriveHotspots(runways, taxi.taxiways, role, layout.derive("hotspots")),
    lahso: deriveLahso(runways),
    frequencies, rampFrequencies: ramps, cautions, notes,
    terminalArchetype: archetype,
    chartNumber: String(numbers.int(10037, 99999)), alNumber: `AL-${numbers.int(1, 999)} (FAA)`,
    cycle: identity.cycle,
  };
}
