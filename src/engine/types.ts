export type Point = { x: number; y: number };
export type Segment = { a: Point; b: Point };
export type Polygon = Point[];
export type Role = "basic-ga" | "business-ga" | "regional" | "mid-hub" | "major-hub" | "mega-hub";
export type TerminalArchetype = "none" | "linear" | "pier" | "parallel" | "satellite" | "unit" | "semicircle";

export interface Identity {
  airportName: string;
  city: string;
  state: string;
  id: string;
  lat: number;
  lon: number;
  elevation: number;
  variation: number;
  region: string;
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

export interface RunwayEnd {
  designator: string;
  elevation: number;
  magneticHeading: number;
  displaced: number;
  treatment?: "blast-pad" | "emas";
}

export interface Runway {
  id: string;
  center: Point;
  heading: number;
  length: number;
  width: number;
  ends: [RunwayEnd, RunwayEnd];
  slope: number;
  closed?: boolean;
  centerlineLights: boolean;
  pcn: string;
}

export interface Taxiway {
  id: string;
  name: string;
  points: Point[];
  width: number;
  kind: "parallel" | "connector" | "exit" | "apron-throat" | "service";
  runwayId?: string;
}

export interface HoldLine {
  point: Point;
  angle: number;
  taxiwayName: string;
  runwayId: string;
}

export interface Building {
  id: string;
  kind: "terminal" | "hangar" | "fbo" | "cargo" | "fire" | "tower" | "fuel";
  label: string;
  polygon: Polygon;
}

export interface Apron {
  id: string;
  kind: "terminal" | "ga" | "cargo" | "ron" | "deice";
  polygon: Polygon;
  label?: string;
}

export interface Hotspot {
  id: number;
  point: Point;
  rx: number;
  ry: number;
  angle: number;
  reason: string;
}

export interface Frequency {
  label: string;
  value: string;
  detail?: string;
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
  hotspots: Hotspot[];
  frequencies: Frequency[];
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
