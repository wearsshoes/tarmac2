import { RNG } from "./rng";
import { add, perp, pointAlong, polar, rect, roundedRectPolygon, runwayEndpoints, scale } from "./geometry";
import type { Apron, Building, DesignCode, Frequency, GenerateOptions, HoldLine, Hotspot, Identity, Point, Role, Runway, SiteModel, Taxiway, TerminalArchetype } from "./types";

const ROLES: Role[] = ["basic-ga", "business-ga", "regional", "mid-hub", "major-hub", "mega-hub"];
const TAXI_LETTERS = "ABCDEFGHJKLMNPQRSTUVWYZ".split("");

const ROLE = {
  "basic-ga":    { code: ["B", "II", "2A", "VISUAL", 35, 200, 175] as const, length: [3000, 4800], width: 75, parallels: 1, parcel: [9500, 6200] },
  "business-ga": { code: ["B", "II", "2A", "2400", 35, 240, 200] as const, length: [5200, 7000], width: 100, parallels: 1, parcel: [12000, 7600] },
  regional:      { code: ["C", "III", "3", "2400", 50, 400, 250] as const, length: [7200, 9400], width: 150, parallels: 2, parcel: [16000, 10000] },
  "mid-hub":     { code: ["C", "IV", "4", "1200", 50, 400, 250] as const, length: [8800, 11000], width: 150, parallels: 2, parcel: [19000, 12500] },
  "major-hub":   { code: ["D", "V", "5", "1200", 75, 450, 280] as const, length: [10000, 12500], width: 150, parallels: 3, parcel: [23500, 17000] },
  "mega-hub":    { code: ["D", "V", "5", "1200", 75, 500, 280] as const, length: [11000, 13500], width: 150, parallels: 4, parcel: [28000, 21000] },
};

const REGIONS = [
  { key: "northeast", states: [["MA", 42.1, -71.8], ["NY", 42.7, -75.2], ["PA", 40.8, -77.7]], elev: [40, 900], var: -14, cities: ["Ashford", "Northfield", "Hawthorne", "Millbrook"] },
  { key: "southeast", states: [["GA", 33.2, -83.5], ["NC", 35.5, -79.4], ["TN", 35.8, -86.2]], elev: [180, 1600], var: -6, cities: ["Calder", "Fairview", "Pinehurst", "Red Clay"] },
  { key: "midwest", states: [["MN", 45.0, -94.2], ["IL", 40.2, -89.1], ["OH", 40.3, -82.7]], elev: [500, 1500], var: 2, cities: ["Elk River", "Granite Falls", "Lake Union", "Prairie City"] },
  { key: "mountain", states: [["CO", 39.0, -105.5], ["UT", 39.5, -111.6], ["MT", 46.8, -110.2]], elev: [3200, 7200], var: 8, cities: ["Canyon Ridge", "Silver Creek", "Juniper", "Frontier"] },
  { key: "pacific", states: [["CA", 36.2, -119.8], ["OR", 44.1, -120.5], ["WA", 47.2, -120.7]], elev: [20, 2800], var: 13, cities: ["Cypress Bay", "Cascade", "Westhaven", "Port Mercer"] },
] as const;

const AIRPORT_WORDS = ["Regional", "Municipal", "International", "Gateway", "Memorial", "Air Center"];

function snap(value: number, increment: number): number { return Math.round(value / increment) * increment; }
function pad(value: number, count = 2): string { return String(value).padStart(count, "0"); }

function identity(rng: RNG, requestedRegion?: string): Identity {
  const region = REGIONS.find((r) => r.key === requestedRegion) ?? rng.pick(REGIONS);
  const stateChoices = region.states as readonly (readonly [string, number, number])[];
  const [state, baseLat, baseLon] = rng.pick(stateChoices);
  const city = rng.pick(region.cities);
  const id = `${rng.pick("KABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""))}${rng.pick("ABCDEFGHJKLMNPQRSTUVWXYZ".split(""))}${rng.pick("ABCDEFGHJKLMNPQRSTUVWXYZ".split(""))}`;
  const lat = baseLat + rng.float(-1.4, 1.4);
  const lon = baseLon + rng.float(-1.6, 1.6);
  const variation = region.var + rng.float(-1.4, 1.4);
  return {
    city, state, id, lat, lon,
    airportName: `${city} ${rng.pick(AIRPORT_WORDS)}`,
    elevation: snap(rng.float(region.elev[0], region.elev[1]), 1),
    variation: Math.round(variation * 10) / 10,
    region: region.key,
  };
}

function designFor(role: Role): DesignCode {
  const [aac, adg, tdg, visibility, taxiwayWidth, runwayTaxiwaySeparation, holdDistance] = ROLE[role].code;
  return { aac, adg, tdg, visibility, taxiwayWidth, runwayTaxiwaySeparation, holdDistance };
}

function runwayNumber(heading: number): number {
  const n = Math.round(((heading % 360) + 360) % 360 / 10);
  return n === 0 ? 36 : n;
}

function runwaySuffix(index: number, count: number): string {
  if (count === 1) return "";
  if (count === 2) return index === 0 ? "L" : "R";
  if (count === 3) return ["L", "C", "R"][index]!;
  return index % 2 === 0 ? "L" : "R";
}

function reciprocalSuffix(suffix: string): string { return suffix === "L" ? "R" : suffix === "R" ? "L" : suffix; }

function makeRunway(rng: RNG, identity: Identity, role: Role, heading: number, center: Point, index: number, count: number, lengthScale = 1): Runway {
  const cfg = ROLE[role];
  const axisHeading = ((heading % 360) + 360) % 360;
  const altitudeBoost = Math.max(0, identity.elevation - 2000) * 0.18;
  const length = snap(Math.min(14000, rng.float(cfg.length[0], cfg.length[1]) * lengthScale + altitudeBoost), 50);
  const suffix = runwaySuffix(index, count);
  const a = `${pad(runwayNumber(axisHeading))}${suffix}`;
  const b = `${pad(runwayNumber(axisHeading + 180))}${reciprocalSuffix(suffix)}`;
  const endDelta = rng.int(-18, 18);
  const treatmentChance = role === "basic-ga" ? 0.08 : 0.2;
  return {
    id: `${a}-${b}`,
    center, heading: axisHeading, length, width: cfg.width,
    ends: [
      { designator: a, elevation: identity.elevation - Math.max(0, endDelta), magneticHeading: Math.round(axisHeading * 10) / 10, displaced: rng.chance(0.12) ? snap(rng.float(200, 700), 50) : 0, treatment: rng.chance(treatmentChance) ? rng.pick(["blast-pad", "emas"] as const) : undefined },
      { designator: b, elevation: identity.elevation - Math.max(0, -endDelta), magneticHeading: Math.round(((axisHeading + 180) % 360) * 10) / 10, displaced: rng.chance(0.08) ? snap(rng.float(200, 600), 50) : 0, treatment: rng.chance(treatmentChance) ? rng.pick(["blast-pad", "emas"] as const) : undefined },
    ],
    slope: Math.round(Math.abs(endDelta) / length * 1000) / 10,
    centerlineLights: role !== "basic-ga" && rng.chance(0.7),
    pcn: `${rng.int(role.includes("hub") ? 55 : 18, role === "mega-hub" ? 110 : 78)} R/${rng.pick(["B", "C"] as const)}/W/T`,
  };
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

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!; const b = polygon[j]!;
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y || 1) + a.x) inside = !inside;
  }
  return inside;
}

function enforceBuildingFreeZones(buildings: Building[], zones: Point[][], heading: number): Building[] {
  const lateral = perp(polar(heading));
  return buildings.map((building) => {
    let polygon = building.polygon;
    for (let attempt = 0; attempt < 5; attempt++) {
      const center = polygon.reduce((sum, p) => ({ x: sum.x + p.x / polygon.length, y: sum.y + p.y / polygon.length }), { x: 0, y: 0 });
      const intrudes = zones.some((zone) => pointInPolygon(center, zone) || polygon.some((point) => pointInPolygon(point, zone)));
      if (!intrudes) break;
      const side = center.x * lateral.x + center.y * lateral.y >= 0 ? 1 : -1;
      polygon = polygon.map((point) => add(point, scale(lateral, side * 700)));
    }
    return { ...building, polygon };
  });
}

function parcelPolygon(heading: number, width: number, height: number, rng: RNG): Point[] {
  const { at } = frame(heading);
  const clipA = rng.chance(0.55) ? rng.float(300, Math.min(1300, width * 0.08)) : 0;
  const clipB = rng.chance(0.32) ? rng.float(300, Math.min(1100, width * 0.07)) : 0;
  return [
    at(-width / 2 + clipA, -height / 2), at(width / 2 - clipB, -height / 2),
    at(width / 2, -height / 2 + clipB), at(width / 2, height / 2 - clipA),
    at(width / 2 - clipA, height / 2), at(-width / 2 + clipB, height / 2),
    at(-width / 2, height / 2 - clipB), at(-width / 2, -height / 2 + clipA),
  ];
}

function frame(heading: number): { at: (u: number, v: number) => Point; axis: Point; lateral: Point } {
  const axis = polar(heading);
  const lateral = perp(axis);
  return { axis, lateral, at: (u, v) => add(scale(axis, u), scale(lateral, v)) };
}

function buildTaxiways(runways: Runway[], role: Role, design: DesignCode, heading: number): { taxiways: Taxiway[]; holds: HoldLine[] } {
  const taxiways: Taxiway[] = [];
  const holds: HoldLine[] = [];
  const axis = polar(heading);
  const lateral = perp(axis);
  let letterIndex = 0;

  for (const runway of runways) {
    const [a, b] = runwayEndpoints(runway.center, runway.heading, runway.length);
    const runAxis = polar(runway.heading);
    const runLateral = perp(runAxis);
    // Districts occupy the positive lateral side of the primary bank. Keeping each
    // primary-family parallel on that traffic side prevents apron throats from ever
    // becoming direct runway crossings.
    const side = 1;
    const separation = design.runwayTaxiwaySeparation;
    const name = TAXI_LETTERS[letterIndex++]!;
    const jog = role.includes("hub") ? 90 : 55;
    const p0 = add(add(a, scale(runLateral, side * (separation + jog))), scale(runAxis, -80));
    const p1 = add(pointAlong(a, b, 0.13), scale(runLateral, side * separation));
    const p2 = add(pointAlong(a, b, 0.87), scale(runLateral, side * separation));
    const p3 = add(add(b, scale(runLateral, side * (separation + jog))), scale(runAxis, 80));
    taxiways.push({ id: `parallel-${runway.id}`, name, points: [p0, p1, p2, p3], width: design.taxiwayWidth, kind: "parallel", runwayId: runway.id });

    const fractions = role === "basic-ga" ? [0.03, 0.34, 0.67, 0.97] : role.includes("hub") ? [0.02, 0.14, 0.27, 0.43, 0.59, 0.74, 0.88, 0.98] : [0.02, 0.2, 0.4, 0.65, 0.82, 0.98];
    fractions.forEach((t, connectorIndex) => {
      const runwayPoint = pointAlong(a, b, t);
      let localSeparation = separation;
      if (t < 0.13) {
        const alpha = (t * runway.length + 80) / (0.13 * runway.length + 80);
        localSeparation += jog * (1 - alpha);
      } else if (t > 0.87) {
        const alpha = ((1 - t) * runway.length + 80) / (0.13 * runway.length + 80);
        localSeparation += jog * (1 - alpha);
      }
      const taxiPoint = add(runwayPoint, scale(runLateral, side * localSeparation));
      const connectorName = `${name}${connectorIndex + 1}`;
      const isHighSpeed = role !== "basic-ga" && connectorIndex > 0 && connectorIndex < fractions.length - 1 && connectorIndex % 2 === 0;
      const lead = isHighSpeed ? (t < 0.5 ? 260 : -260) : 0;
      const runwayJoin = add(runwayPoint, scale(runAxis, lead));
      const mid = add(pointAlong(runwayJoin, taxiPoint, 0.58), scale(runAxis, -lead * 0.24));
      taxiways.push({ id: `connector-${runway.id}-${connectorIndex}`, name: connectorName, points: isHighSpeed ? [runwayJoin, mid, taxiPoint] : [runwayPoint, taxiPoint], width: design.taxiwayWidth, kind: isHighSpeed ? "exit" : "connector", runwayId: runway.id });
      holds.push({ point: add(runwayPoint, scale(runLateral, side * design.holdDistance)), angle: runway.heading, taxiwayName: connectorName, runwayId: runway.id });
    });
  }

  // Cross-field spines make every parallel and apron route part of one connected graph.
  if (runways.length > 1) {
    const projections = runways.map((r) => r.center.x * lateral.x + r.center.y * lateral.y);
    const lo = Math.min(...projections) - design.runwayTaxiwaySeparation;
    const hi = Math.max(...projections) + design.runwayTaxiwaySeparation;
    const spineName = TAXI_LETTERS[letterIndex++]!;
    for (const u of role.includes("hub") ? [-1800, 1800] : [0]) {
      taxiways.push({ id: `crossfield-${u}`, name: spineName, points: [add(scale(axis, u), scale(lateral, lo)), add(scale(axis, u), scale(lateral, hi))], width: design.taxiwayWidth, kind: "service" });
    }
  }
  return { taxiways, holds };
}

function terminalChoice(role: Role, rng: RNG, override?: TerminalArchetype): TerminalArchetype {
  if (override) return override;
  const options: Record<Role, TerminalArchetype[]> = {
    "basic-ga": ["none"], "business-ga": ["none", "linear"], regional: ["linear", "pier"],
    "mid-hub": ["pier", "parallel", "unit"], "major-hub": ["pier", "parallel", "satellite", "unit", "semicircle"],
    "mega-hub": ["parallel", "satellite", "unit", "semicircle", "pier"],
  };
  return rng.pick(options[role]);
}

function buildDistricts(rng: RNG, role: Role, archetype: TerminalArchetype, heading: number, primaryLength: number, lateralOffset: number, networkLateral: number): { buildings: Building[]; aprons: Apron[]; throats: Taxiway[] } {
  const { at } = frame(heading);
  const buildings: Building[] = [];
  const aprons: Apron[] = [];
  const throats: Taxiway[] = [];
  const side = lateralOffset;
  const addBuilding = (kind: Building["kind"], label: string, u: number, v: number, w: number, h: number, angle = heading) => {
    buildings.push({ id: `${kind}-${buildings.length}`, kind, label, polygon: rect(at(u, v), w, h, angle) });
  };

  if (archetype === "none") {
    const apronCenter = at(-primaryLength * 0.08, side);
    aprons.push({ id: "ga-apron", kind: "ga", label: "GENERAL AVIATION PARKING", polygon: roundedRectPolygon(apronCenter, 2200, 1050, 120, heading) });
    for (let i = 0; i < 5; i++) addBuilding(i === 0 ? "fbo" : "hangar", i === 0 ? "FBO" : "HANGARS", -850 + i * 420, side + 660, i === 0 ? 360 : 300, i === 0 ? 180 : 520);
  } else {
    const hub = role.includes("hub");
    const apronWidth = hub ? Math.min(primaryLength * 0.78, 8500) : 3600;
    const apronDepth = hub ? 2500 : 1500;
    aprons.push({ id: "terminal-apron", kind: "terminal", polygon: roundedRectPolygon(at(0, side), apronWidth, apronDepth, 180, heading) });
    const processorV = side + Math.sign(side) * (apronDepth * 0.26);
    const processorWidth = archetype === "linear" ? apronWidth * 0.58 : Math.min(2300, apronWidth * 0.35);
    addBuilding("terminal", "TERMINAL", 0, processorV, processorWidth, hub ? 360 : 270);

    if (archetype === "linear") {
      addBuilding("terminal", "TERMINAL", -processorWidth * 0.47, processorV - Math.sign(side) * 80, 380, 180);
      addBuilding("terminal", "TERMINAL", processorWidth * 0.42, processorV + Math.sign(side) * 65, 460, 170);
    } else if (archetype === "pier") {
      const count = role === "regional" ? 1 : role === "mid-hub" ? 3 : 4;
      for (let i = 0; i < count; i++) {
        const u = (i - (count - 1) / 2) * (hub ? 670 : 520);
        const pierLength = hub ? rng.float(1100, 1800) : rng.float(650, 1050);
        addBuilding("terminal", "TERMINAL", u, processorV - Math.sign(side) * pierLength / 2, hub ? 150 : 120, pierLength);
        if (i % 2 === 0) addBuilding("terminal", "TERMINAL", u, processorV - Math.sign(side) * pierLength, 430, 145);
      }
    } else if (archetype === "parallel" || archetype === "satellite") {
      const count = role === "mega-hub" ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const v = processorV - Math.sign(side) * (650 + i * 520);
        const length = Math.min(apronWidth * (0.58 + i * 0.08), 5000);
        addBuilding("terminal", `CONCOURSE ${String.fromCharCode(65 + i)}`, rng.float(-180, 180), v, length, hub ? 190 : 150);
        if (archetype === "satellite" && i === count - 1) {
          addBuilding("terminal", `CONCOURSE ${String.fromCharCode(65 + i)}`, -length / 2, v, 300, 360);
          addBuilding("terminal", `CONCOURSE ${String.fromCharCode(65 + i)}`, length / 2, v, 300, 360);
        }
      }
    } else if (archetype === "unit") {
      const count = role === "mega-hub" ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const u = (i - (count - 1) / 2) * 1200;
        addBuilding("terminal", `TERMINAL ${i + 1}`, u, processorV - Math.sign(side) * 350, 720, 300);
        addBuilding("terminal", `TERMINAL ${i + 1}`, u, processorV - Math.sign(side) * 650, 180, 650);
      }
    } else if (archetype === "semicircle") {
      const count = role === "mega-hub" ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const theta = (-65 + i * 130 / (count - 1)) * Math.PI / 180;
        const u = Math.sin(theta) * 1900;
        const v = processorV - Math.sign(side) * (700 + Math.cos(theta) * 750);
        addBuilding("terminal", `TERMINAL ${String.fromCharCode(65 + i)}`, u, v, 850, 240, heading - theta * 180 / Math.PI);
      }
    }
  }

  // Peripheral campuses: readable blocks, separated from the passenger core.
  const cargoV = side + Math.sign(side) * 1250;
  const cargoU = primaryLength * 0.32;
  aprons.push({ id: "cargo-apron", kind: "cargo", label: "CARGO RAMP", polygon: roundedRectPolygon(at(cargoU, cargoV), role.includes("hub") ? 1900 : 1100, 800, 100, heading) });
  addBuilding("cargo", "CARGO", cargoU, cargoV + Math.sign(side) * 420, role.includes("hub") ? 1200 : 650, 260);
  addBuilding("fire", "FIRE STATION", 0, side + Math.sign(side) * 1450, 360, 220);
  addBuilding("tower", "TWR/BCN", -primaryLength * 0.17, side + Math.sign(side) * 1200, 115, 115);
  addBuilding("fuel", "FUEL FARM", -primaryLength * 0.34, side + Math.sign(side) * 1300, 300, 260);

  if (role.includes("hub")) {
    const remoteU = -primaryLength * 0.33;
    aprons.push({ id: "ron-apron", kind: "ron", label: "REMAIN OVERNIGHT APRON", polygon: roundedRectPolygon(at(remoteU, side + Math.sign(side) * 280), 1500, 720, 100, heading) });
    aprons.push({ id: "deice-pad", kind: "deice", label: "DEICE PAD", polygon: roundedRectPolygon(at(remoteU + 1450, side - Math.sign(side) * 460), 720, 520, 90, heading) });
    addBuilding("hangar", "MAINTENANCE HANGAR", cargoU + 1100, cargoV + Math.sign(side) * 520, 900, 360);
  }

  const throatCount = role.includes("hub") ? 5 : 3;
  for (let i = 0; i < throatCount; i++) {
    const u = (i - (throatCount - 1) / 2) * (role.includes("hub") ? 900 : 650);
    throats.push({ id: `apron-throat-${i}`, name: `R${i + 1}`, points: [at(u, networkLateral), at(u + (i % 2 ? 120 : -120), side)], width: role.includes("hub") ? 100 : 60, kind: "apron-throat" });
  }
  return { buildings, aprons, throats };
}

function frequencies(role: Role, rng: RNG, city: string): Frequency[] {
  const freq = (low: number, high: number) => (Math.round(rng.float(low, high) * 20) / 20).toFixed(2);
  if (role === "basic-ga") return [{ label: "ASOS", value: `${freq(118, 121)} (${rng.int(200, 999)}-${rng.int(1000, 9999)})` }, { label: "CTAF/UNICOM", value: freq(122.7, 123.05) }];
  const rows: Frequency[] = [
    { label: role.includes("hub") ? "D-ATIS" : "ATIS", value: freq(118, 125) },
    { label: `${city.toUpperCase()} TOWER`, value: freq(118, 128) },
    { label: "GND CON", value: freq(121.5, 127) },
    { label: "CLNC DEL", value: freq(118, 126) },
  ];
  if (role === "major-hub" || role === "mega-hub") rows.push({ label: "CPDLC/PDC", value: "AVBL" }, { label: "GND METERING", value: freq(120, 134) });
  return rows;
}

function hotspots(runways: Runway[], taxiways: Taxiway[], role: Role): Hotspot[] {
  const limit = role === "mega-hub" ? 5 : role.includes("hub") ? 3 : 1;
  const candidates = taxiways.filter((t) => t.kind === "connector" || t.kind === "service");
  return candidates.slice(0, limit).map((t, index) => ({
    id: index + 1, point: t.points[Math.floor(t.points.length / 2)]!, rx: role.includes("hub") ? 310 : 220, ry: 150,
    angle: runways[index % runways.length]!.heading, reason: index === 0 ? "THRESHOLD CONNECTOR CLUSTER" : "RUNWAY CROSSING",
  }));
}

export function generate(seed: string, options: GenerateOptions = {}): SiteModel {
  const rng = new RNG(seed || "TARMAC");
  const role = options.role ?? rng.pick(ROLES);
  const siteRng = new RNG(seed, "site");
  const identityData = identity(siteRng, options.region);
  const design = designFor(role);
  const heading = snap(siteRng.float(5, 174), 10) % 180;
  const cfg = ROLE[role];
  const { at } = frame(heading);
  const separation = role === "mega-hub" ? 3100 : role === "major-hub" ? 2500 : role === "mid-hub" ? 2500 : role === "regional" ? 1200 : 0;
  const runways: Runway[] = [];
  for (let i = 0; i < cfg.parallels; i++) {
    const offset = (i - (cfg.parallels - 1) / 2) * separation;
    const stagger = cfg.parallels > 1 ? (i % 2 ? 400 : -400) : 0;
    const runwayHeading = cfg.parallels === 4 ? heading + (i < 2 ? -5.1 : 4.9) : heading;
    runways.push(makeRunway(new RNG(seed, `runway-${i}`), identityData, role, runwayHeading, at(stagger, offset), i, cfg.parallels, i === cfg.parallels - 1 && cfg.parallels > 2 ? 0.88 : 1));
  }
  if ((role === "basic-ga" && siteRng.chance(0.52)) || (role === "business-ga" && siteRng.chance(0.28)) || (role === "regional" && siteRng.chance(0.2))) {
    const crossHeading = (heading + siteRng.pick([60, 70, 110, 120])) % 180;
    runways.push(makeRunway(new RNG(seed, "crosswind"), identityData, role, crossHeading, at(cfg.length[0] * 0.28, 0), 0, 1, 0.67));
  }

  const taxi = buildTaxiways(runways, role, design, heading);
  const archetype = terminalChoice(role, siteRng, options.archetype);
  const runwayOffsets = runways.slice(0, cfg.parallels).map((r) => r.center.x * perp(polar(heading)).x + r.center.y * perp(polar(heading)).y);
  const outer = Math.max(...runwayOffsets) + design.runwayTaxiwaySeparation + (role.includes("hub") ? 1250 : 900);
  const terminalNetwork = Math.max(...runwayOffsets) + design.runwayTaxiwaySeparation;
  const districts = buildDistricts(new RNG(seed, "districts"), role, archetype, heading, runways[0]!.length, outer, terminalNetwork);
  taxi.taxiways.push(...districts.throats);

  const parcelWidth = Math.max(cfg.parcel[0], Math.max(...runways.map((r) => r.length)) + (design.visibility === "1200" ? 7000 : 3600));
  const parcelHeight = Math.max(cfg.parcel[1], (cfg.parallels - 1) * separation + 6500);
  const parcel = parcelPolygon(heading, parcelWidth, parcelHeight, new RNG(seed, "parcel"));
  const zones = protectionZones(runways, design.visibility === "1200");
  const safeBuildings = enforceBuildingFreeZones(districts.buildings, zones, heading);
  const cycleYear = 2026;

  return {
    seed, identity: identityData, role, design, windHeading: heading, parcel, protectionZones: zones, runways,
    taxiways: taxi.taxiways, holdLines: taxi.holds, aprons: districts.aprons, buildings: safeBuildings,
    hotspots: hotspots(runways, taxi.taxiways, role), frequencies: frequencies(role, siteRng, identityData.city), terminalArchetype: archetype,
    chartNumber: String(siteRng.int(10000, 99999)), alNumber: `AL-${siteRng.int(20, 650)} (FAA)`,
    cycle: `${siteRng.pick(["NE", "SE", "NC", "SW"])}-${siteRng.int(1, 4)}, 08 AUG ${cycleYear} to 05 SEP ${cycleYear}`,
  };
}
