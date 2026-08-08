import type { RNG } from "./rng";
import type { Identity } from "./types";

/** Fictional identity generation — harvest H2 port. The consistency mechanism:
 * each ICAO prefix letter carries a weight and a plausible lat/lon bounding box;
 * coordinates are drawn from the chosen prefix's box so the ICAO letter and the
 * graticule always agree. */

type PrefixBox = { prefix: string; weight: number; lat: [number, number]; lon: [number, number] };

const REGIONS: Record<string, { prefixes: PrefixBox[]; agonic: number; first: string[]; second: string[]; cityPrefixes: [string[], number]; territories: string[]; surnames: string[] }> = {
  americas: {
    prefixes: [
      { prefix: "K", weight: 0.55, lat: [26, 48], lon: [-124, -70] },
      { prefix: "C", weight: 0.2, lat: [43, 58], lon: [-128, -60] },
      { prefix: "S", weight: 0.25, lat: [-38, 8], lon: [-79, -40] },
    ],
    agonic: -95,
    first: ["Ash", "Bel", "Cald", "Clear", "Dun", "Elk", "Fair", "Gran", "Hart", "Ket", "Lark", "Mill", "North", "Oak", "Pine", "Quin", "Red", "Stone", "Wick", "Winter"],
    second: ["brook", "bury", "dale", "field", "ford", "haven", "kami", "land", "mont", "more", "port", "ridge", "rock", "ton", "vale", "ville", "water", "wood"],
    cityPrefixes: [["Port", "New", "Fort", "Lake", "East", "West", "Grand"], 0.4],
    territories: ["NEW CASCADIA", "VERMILION", "WESTMARCH", "CALVERT", "HURON PLAINS", "SANTA VERA", "ALTAMIRA", "REDSTONE", "KENNEBEC", "SONTERRA"],
    surnames: ["HOLLISTER", "GRANGER", "MCALLEN", "PRUITT", "WHITFIELD", "DELACROIX"],
  },
  europe: {
    prefixes: [
      { prefix: "E", weight: 0.5, lat: [48, 62], lon: [-5, 25] },
      { prefix: "L", weight: 0.5, lat: [36, 48], lon: [-9, 28] },
    ],
    agonic: 5,
    first: ["Alten", "Bruck", "Caster", "Dor", "Els", "Fren", "Gral", "Hoch", "Kess", "Lind", "Mar", "Nor", "Oster", "Pfal", "Ravens", "Salz", "Tren", "Vel", "Wester", "Zell"],
    second: ["bach", "berg", "bourg", "brunn", "dorf", "feld", "gate", "heim", "holm", "ingen", "mark", "mund", "nau", "stad", "tal", "wick", "witz", "zell"],
    cityPrefixes: [["Bad", "Sankt", "Nova", "Ober"], 0.15],
    territories: ["OSTMARK", "VALBRETAGNE", "KARELIA MINOR", "TYRELLIA", "NORDHOLM", "LUSENNE", "CARINTHER", "BRAVANTE"],
    surnames: ["BRANDT", "KELLER", "MORAVEC", "LINDQVIST", "FERRARO", "DUCHENE"],
  },
  asia: {
    prefixes: [
      { prefix: "R", weight: 0.25, lat: [14, 43], lon: [120, 146] },
      { prefix: "V", weight: 0.25, lat: [6, 28], lon: [68, 108] },
      { prefix: "Z", weight: 0.25, lat: [22, 48], lon: [78, 128] },
      { prefix: "O", weight: 0.25, lat: [14, 38], lon: [36, 62] },
    ],
    agonic: 105,
    first: ["Ame", "Ban", "Chal", "Dara", "Gol", "Hana", "Jin", "Kata", "Lian", "Mira", "Naga", "Osa", "Pan", "Rasa", "Sen", "Tama", "Ulan", "Vira", "Yona", "Zhu"],
    second: ["bara", "chi", "dao", "garh", "jaya", "kami", "lore", "mati", "nagar", "pura", "qing", "shan", "stan", "tani", "ula", "wan", "yama", "zaki"],
    cityPrefixes: [[], 0],
    territories: ["KANSHU", "VELAPUR", "TARIM BASIN", "SORYAN", "MEGHAT", "QIRAT", "HANSEONG", "ZUFARIA"],
    surnames: ["MASUDA", "RAVANE", "THAKRAL", "OYUN", "SHIRVANI", "KWAN"],
  },
  oceania: {
    prefixes: [
      { prefix: "Y", weight: 0.6, lat: [-43, -12], lon: [113, 153] },
      { prefix: "N", weight: 0.4, lat: [-40, -15], lon: [158, 179] },
    ],
    agonic: 140,
    first: ["Arn", "Bel", "Coo", "Dar", "Eucla", "Gera", "Kal", "Kim", "Mand", "Nar", "Ota", "Para", "Quil", "Rang", "Tara", "Toko", "Wai", "Wang", "Whan", "Yar"],
    second: ["borne", "bury", "dale", "ford", "gong", "kura", "loo", "mata", "moana", "ora", "para", "poto", "rah", "roa", "ton", "tville", "wera", "wick"],
    cityPrefixes: [["Port", "Mount", "Cape"], 0.3],
    territories: ["NEW TASMAR", "KORORIA", "CAPRICORNIA", "WESTRALIS", "AOTEA REACH", "MARLBOROUGH SOUND", "NULLAGINE", "TE MOANA"],
    surnames: ["FAIRWEATHER", "NGATOA", "CALLAGHAN", "TE RANGI", "BUCHANAN", "WIREMU"],
  },
  africa: {
    prefixes: [
      { prefix: "D", weight: 0.25, lat: [4, 18], lon: [-16, 14] },
      { prefix: "F", weight: 0.3, lat: [-33, -2], lon: [12, 40] },
      { prefix: "G", weight: 0.2, lat: [5, 24], lon: [-17, -1] },
      { prefix: "H", weight: 0.25, lat: [-4, 30], lon: [30, 48] },
    ],
    agonic: 20,
    first: ["Aba", "Bandi", "Chi", "Dara", "Enu", "Gao", "Kai", "Kib", "Lira", "Mara", "Nio", "Oda", "Ras", "Sero", "Tam", "Uba", "Wag", "Yala", "Zin", "Kofa"],
    second: ["bara", "bela", "dara", "doro", "gali", "goma", "kano", "kele", "lindi", "mara", "moro", "nda", "ngele", "ougou", "roka", "sana", "tembe", "wana"],
    cityPrefixes: [[], 0],
    territories: ["AZANIA WEST", "KONGWE", "SAHELIA", "MASALIA", "TERRA BENGO", "ZAMARET", "NUBIQUA", "VOLTAINE"],
    surnames: ["OKONNAR", "DIABATE", "MWANGI", "TESFAYE", "BALOGUN", "CHISANO"],
  },
};

const REGION_KEYS = Object.keys(REGIONS);
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function joinSyllables(first: string, second: string): string {
  // Seam de-duplication: Wick + kami → "Wickami".
  const a = first.toLowerCase();
  const b = second.toLowerCase();
  for (let overlap = Math.min(3, a.length, b.length); overlap > 0; overlap--) {
    if (a.endsWith(b.slice(0, overlap))) return first + second.slice(overlap);
  }
  return first + second;
}

function deriveCodes(city: string, prefix: string, rng: RNG): { iata: string; icao: string } {
  // Initials of every word → consonants of the last word → remaining letters; first 3 distinct.
  const words = city.toUpperCase().split(/[\s-]+/).filter(Boolean);
  const last = words[words.length - 1] ?? "AAA";
  const pool = [
    ...words.map((w) => w[0]!),
    ...last.slice(1).split("").filter((ch) => !"AEIOU".includes(ch)),
    ...last.slice(1).split("").filter((ch) => "AEIOU".includes(ch)),
    ...Array.from({ length: 6 }, () => String.fromCharCode(65 + rng.int(0, 25))),
  ];
  const letters: string[] = [];
  for (const ch of pool) {
    if (!/[A-Z]/.test(ch) || letters.includes(ch)) continue;
    letters.push(ch);
    if (letters.length === 3) break;
  }
  while (letters.length < 3) letters.push(String.fromCharCode(65 + rng.int(0, 25)));
  const iata = letters.join("");
  return { iata, icao: `${prefix}${iata}` };
}

function airacWindow(rng: RNG): string {
  // 28-day effectivity window anchored to a real AIRAC-style cycle date.
  const anchor = Date.UTC(2024, 0, 25);
  const start = anchor + rng.int(0, 38) * 28 * 86400000;
  const end = start + 28 * 86400000;
  const fmt = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };
  return `${fmt(start)} to ${fmt(end)}`;
}

export function makeIdentity(rng: RNG, requestedRegion?: string): Identity {
  const regionKey = requestedRegion && REGIONS[requestedRegion] ? requestedRegion : rng.pick(REGION_KEYS);
  const region = REGIONS[regionKey]!;
  const box = rng.weighted(region.prefixes.map((p) => [p, p.weight] as const));
  const lat = rng.float(box.lat[0], box.lat[1]);
  const lon = rng.float(box.lon[0], box.lon[1]);

  let city = joinSyllables(rng.pick(region.first), rng.pick(region.second));
  const [prefixPool, prefixChance] = region.cityPrefixes;
  if (prefixPool.length > 0 && rng.chance(prefixChance)) city = `${rng.pick(prefixPool)} ${city}`;
  const territory = rng.pick(region.territories);
  const codes = deriveCodes(city, box.prefix, rng);

  // Name-style roll: 55% INTL, 20% RGNL, 15% RGNL - SURNAME FLD, 10% SURNAME FLD / MUNI.
  const cityCaps = city.toUpperCase();
  const surname = rng.pick(region.surnames);
  const styleRoll = rng.next();
  const airportName =
    styleRoll < 0.55 ? `${cityCaps} INTL` :
    styleRoll < 0.75 ? `${cityCaps} RGNL` :
    styleRoll < 0.9 ? `${cityCaps} RGNL - ${surname} FLD` :
    rng.chance(0.5) ? `${surname} FLD` : `${cityCaps} MUNI`;

  // Magnetic variation from longitude: positive = east, negative = west.
  let variation = (region.agonic - lon) * 0.25 + rng.gauss(0, 2);
  variation = Math.max(-16, Math.min(16, variation));
  variation = Math.round(variation * 2) / 2;
  if (variation === 0) variation = rng.chance(0.5) ? 0.5 : -0.5;

  // Field elevation: 55% lowland, else a long tail to ~6,000 ft.
  const elevation = rng.chance(0.55) ? rng.int(8, 350) : Math.round(350 + rng.next() ** 2 * 5650);

  // Volume string: hemisphere code from lat/lon, 25% override to a central volume.
  let hemisphere = `${lat >= 0 ? "N" : "S"}${lon >= 0 ? "E" : "W"}`;
  if (rng.chance(0.25)) hemisphere = rng.pick(["NC", "EC"]);
  const cycle = `${hemisphere}-${rng.int(1, 4)}, ${airacWindow(rng)}`;

  return { airportName, city, state: territory, id: codes.iata, icao: codes.icao, lat, lon, elevation, variation, region: regionKey, cycle };
}
