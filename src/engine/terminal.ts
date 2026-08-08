import type { RNG } from "./rng";
import type { Apron, Building, Point, Polygon, Role, TerminalArchetype } from "./types";

/** Terminal grammar (harvest H5 machinery + terminal-design.md dimensions).
 * Every piece is authored in a local (along=u, cross=v) bar frame with +v pointing
 * airside (toward the runways); the caller supplies at(u, v) → world. */

export interface TerminalComplex {
  buildings: Building[];
  aprons: Apron[];
  /** u-stations along the apron's airside edge where throat stubs should meet taxiways. */
  throats: number[];
  /** v of the apron's airside edge. */
  apronEdgeV: number;
  extentU: [number, number];
}

type Frame = (u: number, v: number) => Point;

/** Notched processor box: airside face straight, landside ends recessed ~40 ft
 * over the outer ~28% margins — the subtle silhouette real chart buildings have. */
function notchedBox(u0: number, v0: number, length: number, depth: number): { u: number; v: number }[] {
  const L = length / 2;
  const m = length * 0.28;
  const notch = 40;
  return [
    { u: u0 - L, v: v0 + depth / 2 }, { u: u0 + L, v: v0 + depth / 2 },
    { u: u0 + L, v: v0 - depth / 2 + notch }, { u: u0 + L - m, v: v0 - depth / 2 + notch },
    { u: u0 + L - m, v: v0 - depth / 2 }, { u: u0 - L + m, v: v0 - depth / 2 },
    { u: u0 - L + m, v: v0 - depth / 2 + notch }, { u: u0 - L, v: v0 - depth / 2 + notch },
  ];
}

function bar(u0: number, v0: number, length: number, width: number): { u: number; v: number }[] {
  return [
    { u: u0 - length / 2, v: v0 - width / 2 }, { u: u0 + length / 2, v: v0 - width / 2 },
    { u: u0 + length / 2, v: v0 + width / 2 }, { u: u0 - length / 2, v: v0 + width / 2 },
  ];
}

/** Chord-clipped bulge for rotundas/tip pods: circle center 0.35r behind the chord →
 * ~220° of visible arc, endpoints exactly on the host face. Host face is the segment
 * from (uA,v0) to (uB,v0); the bulge extends toward +dir in v. */
function bulge(uA: number, uB: number, v0: number, dir: 1 | -1, r: number): { u: number; v: number }[] {
  const uc = (uA + uB) / 2;
  const vc = v0 - dir * 0.35 * r;
  const points: { u: number; v: number }[] = [];
  const steps = 12;
  // Sample the major arc (through the apex away from the chord).
  const a0 = Math.atan2(dir * (v0 - vc), uA - uc);
  const a1 = Math.atan2(dir * (v0 - vc), uB - uc);
  let sweep = a1 - a0;
  while (sweep > 0) sweep -= 2 * Math.PI;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + sweep * (i / steps);
    points.push({ u: uc + Math.cos(a) * r, v: vc + dir * Math.sin(a) * r });
  }
  return points;
}

/** Arc band for curved concourses: from chord half-length h and sag s,
 * R = (h² + s²) / 2s; outer/inner arcs at R ± halfWidth. Convex side faces +v. */
function arcBand(u0: number, v0: number, chord: number, sag: number, width: number): { u: number; v: number }[] {
  const h = chord / 2;
  const R = (h * h + sag * sag) / (2 * sag);
  const vc = v0 + sag - R;
  const theta = Math.asin(h / R);
  const points: { u: number; v: number }[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = -theta + (2 * theta * i) / steps;
    points.push({ u: u0 + Math.sin(a) * (R + width / 2), v: vc + Math.cos(a) * (R + width / 2) });
  }
  for (let i = steps; i >= 0; i--) {
    const a = -theta + (2 * theta * i) / steps;
    points.push({ u: u0 + Math.sin(a) * (R - width / 2), v: vc + Math.cos(a) * (R - width / 2) });
  }
  return points;
}

function capFor(rng: RNG, u0: number, tipV: number, barWidth: number, kind: "tee" | "wye" | "pod" | "rotunda"): { u: number; v: number }[][] {
  if (kind === "tee") return [bar(u0, tipV + 60, rng.float(320, 520), 120)];
  if (kind === "wye") {
    const armLen = rng.float(260, 420);
    const arm = (side: 1 | -1): { u: number; v: number }[] => {
      const s = Math.SQRT1_2;
      const du = side * armLen * s; const dv = armLen * s;
      const w = 95;
      return [
        { u: u0, v: tipV - 40 }, { u: u0 + du, v: tipV - 40 + dv },
        { u: u0 + du + side * w * s, v: tipV - 40 + dv - w * s }, { u: u0 + side * w * s, v: tipV - 40 - w * s },
      ];
    };
    return [arm(1), arm(-1)];
  }
  const r = kind === "rotunda" ? rng.float(110, 160) : rng.float(75, 110);
  return [bulge(u0 - barWidth / 2, u0 + barWidth / 2, tipV, 1, r)];
}

const CONCOURSE_LETTERS = "ABCDEFGH";

/** Airside apron edge with discrete staggered throat sections: full depth around
 * each throat station, recessed between them (never a full-width bleed). */
function steppedEdge(uRight: number, uLeft: number, vFull: number, throats: number[]): { u: number; v: number }[] {
  const vRecess = vFull - 130;
  const half = 300;
  const stations = throats.slice().sort((a, b) => b - a);
  const points: { u: number; v: number }[] = [{ u: uRight, v: vRecess }];
  for (const t of stations) {
    const hi = Math.min(uRight, t + half);
    const lo = Math.max(uLeft, t - half);
    if (hi <= lo) continue;
    points.push({ u: hi, v: vRecess }, { u: hi, v: vFull }, { u: lo, v: vFull }, { u: lo, v: vRecess });
  }
  points.push({ u: uLeft, v: vRecess });
  return points;
}

export function buildTerminal(rng: RNG, role: Role, archetype: TerminalArchetype, at: Frame): TerminalComplex {
  const hub = role.includes("hub");
  const wide = role === "major-hub" || role === "mega-hub";
  const gateBand = wide ? rng.float(560, 680) : rng.float(340, 420);
  const buildings: Building[] = [];
  const aprons: Apron[] = [];
  const toWorld = (pts: { u: number; v: number }[]): Polygon => pts.map((p) => at(p.u, p.v));
  const addBuilding = (kind: Building["kind"], label: string, pts: { u: number; v: number }[], unlabeled = false) => {
    buildings.push({ id: `${kind}-${buildings.length}`, kind, label, polygon: toWorld(pts), unlabeled });
  };
  let apronPts: { u: number; v: number }[] = [];
  let extentU: [number, number] = [0, 0];
  let apronEdgeV = 0;

  if (archetype === "linear") {
    const length = rng.float(700, 1300);
    const depth = rng.float(160, 240);
    addBuilding("terminal", "TERMINAL", notchedBox(0, 0, length, depth));
    if (rng.chance(0.35)) {
      const stubU = rng.chance(0.5) ? length * 0.32 : -length * 0.32;
      addBuilding("concourse", "TERMINAL", bar(stubU, depth / 2 + 200, 110, 400), true);
    }
    apronEdgeV = depth / 2 + gateBand;
    extentU = [-length / 2 - 250, length / 2 + 250];
    apronPts = [
      { u: extentU[0], v: -20 }, { u: extentU[1], v: -20 },
      { u: extentU[1], v: apronEdgeV }, { u: extentU[0], v: apronEdgeV },
    ];
  } else if (archetype === "pier") {
    const processorLength = hub ? rng.float(1100, 1700) : rng.float(800, 1200);
    const processorDepth = rng.float(200, 300);
    addBuilding("terminal", "TERMINAL", notchedBox(0, 0, processorLength, processorDepth));
    const count = role === "regional" ? rng.int(1, 2) : role === "mid-hub" ? rng.int(2, 3) : rng.int(3, 5);
    const pitch = Math.max(660, processorLength / Math.max(1, count - 0.4));
    const caps: Array<"tee" | "wye" | "pod" | "rotunda" | "none"> = ["none", "tee", "pod", "rotunda", "wye"];
    let maxTip = 0;
    for (let i = 0; i < count; i++) {
      const u = (i - (count - 1) / 2) * pitch + rng.float(-70, 70);
      const length = (hub ? rng.float(900, 1500) : rng.float(650, 1050)) * (i % 2 ? 0.85 : 1);
      const width = rng.float(100, hub ? 160 : 130);
      const root = processorDepth / 2;
      addBuilding("concourse", `CONCOURSE ${CONCOURSE_LETTERS[i]}`, [
        { u: u - width / 2, v: root }, { u: u + width / 2, v: root },
        { u: u + width / 2, v: root + length }, { u: u - width / 2, v: root + length },
      ]);
      const capKind = rng.pick(caps);
      if (capKind !== "none") for (const piece of capFor(rng, u, root + length, width, capKind)) addBuilding("concourse", `CONCOURSE ${CONCOURSE_LETTERS[i]}`, piece, true);
      maxTip = Math.max(maxTip, root + length + (capKind === "none" ? 0 : 320));
    }
    apronEdgeV = maxTip + rng.float(230, 300);
    const halfSpan = ((count - 1) / 2) * pitch + 600;
    extentU = [-Math.max(halfSpan, processorLength / 2 + 220), Math.max(halfSpan, processorLength / 2 + 220)];
    apronPts = [
      { u: extentU[0], v: 0 }, { u: extentU[1], v: 0 },
      { u: extentU[1], v: apronEdgeV }, { u: extentU[0], v: apronEdgeV },
    ];
  } else if (archetype === "parallel" || archetype === "satellite") {
    const processorLength = rng.float(900, 1500);
    addBuilding("terminal", "TERMINAL", notchedBox(0, 0, processorLength, rng.float(240, 340)));
    const barCount = archetype === "satellite" ? rng.int(1, 2) : role === "mega-hub" ? rng.int(3, 4) : rng.int(2, 3);
    const spacing = rng.float(950, 1350);
    let v = rng.float(600, 800);
    let maxLen = 0;
    for (let i = 0; i < barCount; i++) {
      const length = Math.min(3400, rng.float(1800, 2600) + i * rng.float(0, 500));
      maxLen = Math.max(maxLen, length);
      const width = rng.float(130, 190);
      const u = rng.float(-160, 160);
      addBuilding("concourse", `CONCOURSE ${CONCOURSE_LETTERS[i]}`, bar(u, v, length, width));
      if (rng.chance(0.45)) for (const piece of capFor(rng, u - length / 2, v + width / 2, width, "pod")) addBuilding("concourse", `CONCOURSE ${CONCOURSE_LETTERS[i]}`, piece, true);
      v += spacing;
    }
    let maxV = v - spacing + 200;
    if (archetype === "satellite") {
      // Satellite pods beyond the bars, flat face toward the terminal; ~30% are
      // tunnel-reached with no visible connector (real midfield satellites).
      const podCount = rng.int(2, wide ? 4 : 3);
      const podPitch = rng.float(950, 1250);
      for (let i = 0; i < podCount; i++) {
        const u = (i - (podCount - 1) / 2) * podPitch;
        const size = rng.float(280, 420);
        const half = size / 2;
        addBuilding("concourse", `CONCOURSE ${CONCOURSE_LETTERS[barCount + (i > podCount / 2 ? 1 : 0)]}`, [
          { u: u - half, v: v - half * 0.55 }, { u: u - half * 0.55, v: v - half }, { u: u + half * 0.55, v: v - half },
          { u: u + half, v: v - half * 0.55 }, { u: u + half, v: v + half * 0.55 }, { u: u + half * 0.55, v: v + half },
          { u: u - half * 0.55, v: v + half }, { u: u - half, v: v + half * 0.55 },
        ], i > 0);
        if (rng.chance(0.7)) addBuilding("concourse", "CONNECTOR", bar(u, v - spacing / 2, 45, spacing - size), true);
      }
      maxV = v + 320;
    }
    apronEdgeV = maxV + rng.float(260, 340);
    const span = Math.max(processorLength / 2 + 400, maxLen / 2 + 450);
    extentU = [-span, span];
    apronPts = [
      { u: -span, v: 0 }, { u: span, v: 0 },
      { u: span, v: apronEdgeV }, { u: -span, v: apronEdgeV },
    ];
    // Numbered ramp aprons live between the bars; the renderer labels them.
    for (let i = 0; i + 1 < barCount; i++) {
      const rampV = rng.float(600, 800) + spacing * i + spacing / 2;
      aprons.push({ id: `ramp-${i + 1}`, kind: "ron", label: `RAMP ${i + 1}`, polygon: toWorld(bar(0, rampV, 10, 10)) });
    }
  } else if (archetype === "unit") {
    const count = role === "mega-hub" ? rng.int(4, 5) : rng.int(2, 3);
    const pitch = rng.float(1350, 1650);
    let maxTip = 0;
    for (let i = 0; i < count; i++) {
      const u = (i - (count - 1) / 2) * pitch;
      const processorLength = rng.float(700, 1000);
      const depth = rng.float(220, 300);
      addBuilding("terminal", `TERMINAL ${i + 1}`, notchedBox(u, 0, processorLength, depth));
      const style = rng.pick(["pier", "bar", "crescent"] as const);
      if (style === "pier") {
        const length = rng.float(550, 850);
        addBuilding("concourse", `TERMINAL ${i + 1}`, [
          { u: u - 70, v: depth / 2 }, { u: u + 70, v: depth / 2 },
          { u: u + 70, v: depth / 2 + length }, { u: u - 70, v: depth / 2 + length },
        ], true);
        for (const piece of capFor(rng, u, depth / 2 + length, 140, rng.pick(["tee", "pod"] as const))) addBuilding("concourse", `TERMINAL ${i + 1}`, piece, true);
        maxTip = Math.max(maxTip, depth / 2 + length + 320);
      } else if (style === "bar") {
        addBuilding("concourse", `TERMINAL ${i + 1}`, bar(u, depth / 2 + 280, rng.float(750, 1050), 150), true);
        addBuilding("concourse", `TERMINAL ${i + 1}`, bar(u, depth / 2 + 140, 90, 280), true);
        maxTip = Math.max(maxTip, depth / 2 + 360);
      } else {
        addBuilding("concourse", `TERMINAL ${i + 1}`, arcBand(u, depth / 2 + 120, rng.float(700, 950), rng.float(160, 250), rng.float(100, 130)), true);
        maxTip = Math.max(maxTip, depth / 2 + 500);
      }
    }
    apronEdgeV = maxTip + rng.float(260, 340);
    extentU = [-((count - 1) / 2) * pitch - 800, ((count - 1) / 2) * pitch + 800];
    apronPts = [
      { u: extentU[0], v: 0 }, { u: extentU[1], v: 0 },
      { u: extentU[1], v: apronEdgeV }, { u: extentU[0], v: apronEdgeV },
    ];
  } else {
    // semicircle: shallow arcs strung along a spine (DFW pattern), convex airside.
    const count = role === "mega-hub" ? rng.int(3, 5) : rng.int(2, 3);
    const chord = rng.float(950, 1300);
    const pitch = chord + rng.float(350, 550);
    for (let i = 0; i < count; i++) {
      const u = (i - (count - 1) / 2) * pitch;
      addBuilding("terminal", `TERMINAL ${String.fromCharCode(65 + i)}`, arcBand(u, 0, chord, rng.float(220, 330), rng.float(100, 140)));
    }
    apronEdgeV = rng.float(330, 420) + 340;
    extentU = [-((count - 1) / 2) * pitch - chord / 2 - 300, ((count - 1) / 2) * pitch + chord / 2 + 300];
    apronPts = [
      { u: extentU[0], v: -40 }, { u: extentU[1], v: -40 },
      { u: extentU[1], v: apronEdgeV }, { u: extentU[0], v: apronEdgeV },
    ];
  }

  const span = extentU[1] - extentU[0];
  const throatCount = Math.max(2, Math.min(6, Math.round(span / 1400)));
  const throats: number[] = [];
  for (let i = 0; i < throatCount; i++) {
    throats.push(extentU[0] + span * ((i + 0.5) / throatCount) + rng.float(-120, 120));
  }
  // Landside edge stays straight; the airside edge steps around the throats.
  const landside = apronPts.slice(0, 2);
  const airside = steppedEdge(apronPts[1]!.u, apronPts[0]!.u, apronEdgeV, throats);
  aprons.unshift({ id: "terminal-apron", kind: "terminal", polygon: toWorld([...landside, ...airside]) });
  return { buildings, aprons, throats, apronEdgeV, extentU };
}
