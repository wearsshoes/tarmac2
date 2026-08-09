export type Point = { x: number; y: number };
export type Polygon = Point[];
export type Role = "basic-ga" | "business-ga" | "regional" | "mid-hub" | "major-hub" | "mega-hub";
export type TerminalArchetype = "none" | "linear" | "pier" | "parallel" | "satellite" | "unit" | "semicircle";

export interface Identity {
  airportName: string;
  city: string;
  state: string;
  id: string;
  icao: string;
  lat: number;
  lon: number;
  elevation: number;
  variation: number;
  region: string;
  cycle: string;
}

export interface DesignCode {
  aac: "B" | "C" | "D";
  adg: "II" | "III" | "IV" | "V";
  tdg: "2A" | "3" | "4" | "5";
  visibility: "VISUAL" | "2400" | "1200";
  taxiwayWidth: number;
  runwayTaxiwaySeparation: number;
  holdDistance: number;
}

export type ApproachLightSystem = "MALSR" | "ALSF-2" | "SSALR" | "ODALS";

export interface RunwayEnd {
  designator: string;
  elevation: number;
  magneticHeading: number;
  displaced: number;
  blastPad: number;
  emas: number;
  /** Approach light system, rendered as a miniature + circled letter (App 2). */
  approachLights?: ApproachLightSystem;
  /** Visual glide slope indicator on the stated side of the runway. */
  vgsi?: { kind: "PAPI" | "VASI"; side: "L" | "R" };
  reil?: boolean;
}

/** IAC 9 §3.5.2.2–3.5.2.4 pavement lifecycle states. Each state selects both a
 * portrayal and the set of runway data retained on the sheet. */
export type RunwayLifecycle =
  | "active"
  | "closed-indefinite" // still in the database: outline + X per end, data retained
  | "under-construction" // runway record retained: outline + construction label
  | "repurposed" // now taxiway/apron: screened pavement, no runway data
  | "closed-permanent" // outline + one X per end, no designators or data
  | "removed" // out of the database: screened pavement + repeated X's
  | "new-construction"; // dotted outline only

export interface Runway {
  id: string;
  center: Point;
  heading: number;
  length: number;
  width: number;
  ends: [RunwayEnd, RunwayEnd];
  slope: number;
  lifecycle: RunwayLifecycle;
  centerlineLights: boolean;
  pcn: string;
}

export interface Taxiway {
  id: string;
  name: string;
  points: Point[];
  width: number;
  kind: "parallel" | "connector" | "exit" | "apron-throat" | "service" | "bay";
  runwayId?: string;
  /** Suppress the letter label (repair links, throat stubs). */
  unlabeled?: boolean;
}

export interface HoldLine {
  point: Point;
  angle: number;
  runwayId: string;
  kind?: "ils" | "cat2";
}

export interface Building {
  id: string;
  kind: "terminal" | "concourse" | "hangar" | "fbo" | "cargo" | "fire" | "tower" | "fuel" | "military";
  label: string;
  polygon: Polygon;
  /** Suppress the label (repeated hangar bars etc.). */
  unlabeled?: boolean;
}

export interface Apron {
  id: string;
  kind: "terminal" | "ga" | "cargo" | "ron" | "deice" | "hold-pad" | "military" | "overflow";
  polygon: Polygon;
  label?: string;
  tieDowns?: boolean;
}

export interface Hotspot {
  id: number;
  point: Point;
  rx: number;
  ry: number;
  angle: number;
  reason: string;
}

export interface LahsoMark {
  point: Point;
  angle: number;
  runwayId: string;
}

export interface Frequency {
  label: string;
  value: string;
  detail?: string;
  partTime?: boolean;
}

/** Rotating beacon as a source fact: the tower/beacon collocation is recorded, not
 * assumed, so `TWR/BCN` appears only when the beacon really sits on the tower. */
export interface Beacon {
  point: Point;
  onTower: boolean;
}

// --- Terminal subsystem (terminal-generator-plan.md, bounding level 2.5) ---

export type AircraftClass = "regional" | "narrow" | "wide";

/** Every exposed building face is classified before any apron is derived. */
export type EdgeRole = "gate-face" | "landside-curb" | "connector" | "service" | "expansion-end" | "internal";

/** How a component joins its parent; tunnel connectors are simply not drawn. */
export type ComponentConnection = "attached" | "bridge" | "tunnel" | "at-grade";

export interface ComponentEdge {
  role: EdgeRole;
  a: Point;
  b: Point;
  /** Design class of the stands served, gate faces only. */
  aircraftClass?: AircraftClass;
}

export interface TerminalComponent {
  id: string;
  unitId: string;
  kind: "processor" | "concourse" | "pier" | "satellite" | "connector";
  connection: ComponentConnection;
  polygon: Polygon;
  edges: ComponentEdge[];
}

/** An independently processed terminal unit (own curb and processor). */
export interface TerminalUnit {
  id: string;
  name: string;
  /** Reserved curb/parking polygon — never aircraft apron. */
  landsideCourt: Polygon;
  curbLength: number;
  parkingDepth: number;
}

/** Aircraft stand envelope; generated to validate footprint and circulation. */
export interface Stand {
  id: string;
  /** Component id (terminal stands) or apron id (district stand rows). */
  ownerId: string;
  center: Point;
  /** Unit vector, nose direction (toward the served face). */
  facing: Point;
  aircraftClass: AircraftClass;
  pitch: number;
  depth: number;
}

export interface Taxilane {
  id: string;
  ownerId: string;
  kind: "alley" | "collector" | "throat";
  points: Point[];
  width: number;
}

export interface AccretionOp {
  op: "lengthen" | "add-pier" | "cap-pier" | "detach-satellite" | "infill-processor" | "add-unit";
  componentId: string;
  cause: string;
}

export interface TerminalSystem {
  units: TerminalUnit[];
  components: TerminalComponent[];
  /** Loop/spine reservations for unit and curvilinear families (negative space). */
  roadCourts: Polygon[];
  accretion: AccretionOp[];
  gatesPlanned: number;
}

export interface SiteModel {
  seed: string;
  identity: Identity;
  role: Role;
  design: DesignCode;
  windHeading: number;
  parcel: Polygon;
  protectionZones: Polygon[];
  runways: Runway[];
  taxiways: Taxiway[];
  holdLines: HoldLine[];
  aprons: Apron[];
  buildings: Building[];
  beacon: Beacon | null;
  terminal: TerminalSystem | null;
  stands: Stand[];
  taxilanes: Taxilane[];
  hotspots: Hotspot[];
  lahso: LahsoMark[];
  frequencies: Frequency[];
  rampFrequencies: string[][];
  cautions: string[];
  notes: string[];
  /** Grouped runway-lighting notes for the boxed block ("HIRL ALL RWYS"...). */
  lightingNotes: string[];
  /** Declared-distance information available: boxed negative-D indicator. */
  declaredDistances: boolean;
  windCone: { point: Point; segmentedCircle: boolean } | null;
  helipads: Point[];
  /** Apron ids whose building-side edge carries non-movement hatching + legend. */
  nonMovementApronIds: string[];
  /** Sheet carries the structured hot spot table (reasons surfaced). */
  hotspotTable: boolean;
  terminalArchetype: TerminalArchetype;
  chartNumber: string;
  alNumber: string;
  cycle: string;
}

export interface GenerateOptions {
  role?: Role;
  archetype?: TerminalArchetype;
  region?: string;
}
