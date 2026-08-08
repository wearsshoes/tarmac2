#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const userAgent = "tarmac-airport-diagram-test-corpus/2.0";

const sourceConfig = {
  faa: {
    name: "U.S. Federal Aviation Administration (FAA)",
    country: "United States",
    directory: "faa",
    license: "Public domain (U.S. federal government work)",
    index: "https://aeronav.faa.gov/d-tpp/2608/xml_data/d-tpp_Metafile.xml",
    pdfBase: "https://aeronav.faa.gov/d-tpp/2608/",
    airports: [
      ["KITH", "Ithaca Tompkins International"],
      ["KATL", "Hartsfield-Jackson Atlanta International"],
      ["KBOS", "Boston Logan International"],
      ["KCLT", "Charlotte Douglas International"],
      ["KDCA", "Ronald Reagan Washington National"],
      ["KDEN", "Denver International"],
      ["KDFW", "Dallas Fort Worth International"],
      ["KJFK", "John F. Kennedy International"],
      ["KLAS", "Harry Reid International"],
      ["KLAX", "Los Angeles International"],
      ["KMIA", "Miami International"],
      ["KORD", "Chicago O'Hare International"],
      ["KSEA", "Seattle-Tacoma International"],
      ["KSFO", "San Francisco International"],
      ["PANC", "Ted Stevens Anchorage International"],
    ],
  },
  decea: {
    name: "Brazil DECEA / Instituto de Cartografia Aeronautica",
    country: "Brazil",
    directory: "decea-brazil",
    license: "Official chart marked Uso Ostensivo; verify reuse terms before redistribution",
    airports: [
      ["SBBR", "Brasilia International"],
      ["SBCF", "Belo Horizonte/Confins International"],
      ["SBGL", "Rio de Janeiro/Galeao International"],
      ["SBGR", "Sao Paulo/Guarulhos International"],
      ["SBKP", "Viracopos International"],
      ["SBPA", "Salgado Filho International"],
      ["SBRF", "Recife/Guararapes International"],
      ["SBRJ", "Santos Dumont"],
      ["SBSP", "Sao Paulo/Congonhas"],
      ["SBSV", "Salvador International"],
    ],
  },
  airservices: {
    name: "Airservices Australia",
    country: "Australia",
    directory: "airservices-australia",
    license: "Copyright Airservices Australia; verify reuse terms before redistribution",
    index: "https://www.airservicesaustralia.com/aip/current/dap/dap_09JUL2026.htm",
    airports: [
      ["YBAS", "Alice Springs"],
      ["YBBN", "Brisbane"],
      ["YBCG", "Gold Coast"],
      ["YBCS", "Cairns"],
      ["YBHM", "Hamilton Island"],
      ["YBMA", "Mount Isa"],
      ["YBRM", "Broome International"],
      ["YBTL", "Townsville International"],
      ["YMAV", "Melbourne/Avalon"],
      ["YMEN", "Melbourne/Essendon"],
      ["YMHB", "Hobart"],
      ["YMLT", "Launceston"],
      ["YMML", "Melbourne"],
      ["YPAD", "Adelaide"],
      ["YPDN", "Darwin"],
      ["YPJT", "Perth/Jandakot"],
      ["YPPH", "Perth"],
      ["YPPD", "Port Hedland"],
      ["YSCB", "Canberra"],
      ["YSSY", "Sydney/Kingsford Smith"],
    ],
  },
  sacaa: {
    name: "South African Civil Aviation Authority (SACAA)",
    country: "South Africa",
    directory: "sacaa-south-africa",
    license: "Copyright SACAA; verify reuse terms before redistribution",
    index: "https://www.caa.co.za/aeronautical-charts/",
    airports: [
      ["FAOR", "O.R. Tambo International"],
      ["FACT", "Cape Town International"],
      ["FALE", "King Shaka International"],
      ["FAEL", "King Phalo"],
      ["FAKM", "Kimberley"],
      ["FAGC", "Grand Central"],
      ["FAKN", "Kruger Mpumalanga International"],
      ["FALA", "Lanseria International"],
      ["FAPE", "Chief Dawid Stuurman International"],
      ["FAUP", "Upington International"],
    ],
  },
  fintraffic: {
    name: "Fintraffic ANS",
    country: "Finland",
    directory: "fintraffic-finland",
    license: "Copyright Fintraffic ANS; charts are available free of charge as part of the AIP",
    index: "https://www.ais.fi/eaip/currently_effective/index.html",
    pdfBase: "https://www.ais.fi/eaip/currently_effective/documents/Root_WePub/ANSFI/Charts/AD/",
    airports: [
      ["EFHK", "Helsinki-Vantaa"],
      ["EFOU", "Oulu"],
      ["EFRO", "Rovaniemi"],
      ["EFIV", "Ivalo"],
      ["EFKT", "Kittila"],
      ["EFKU", "Kuopio"],
      ["EFJO", "Joensuu"],
      ["EFTP", "Tampere-Pirkkala"],
    ],
  },
  lgs: {
    name: "Latvijas gaisa satiksme (LGS)",
    country: "Latvia",
    directory: "lgs-latvia",
    license: "Copyright Latvijas gaisa satiksme; verify reuse terms before redistribution",
    indexBase: "https://ais.lgs.lv/eAIPfiles/2026_005_09-JUL-2026/data/2026-07-09/",
    airports: [
      ["EVRA", "Riga International", "1598_EVRA_2_24_1_20250710.pdf"],
      ["EVLA", "Liepaja International", "1600_EVLA_2_24_1_20250710.pdf"],
      ["EVRS", "Spilve", "1601_EVRS_2_24_1_20250710.pdf"],
      ["EVGA", "Lielvarde", "1638_EVGA_2_24_1_20250904.pdf"],
      ["EVLI", "Limbazi", "1678_EVLI_2_24_1_20260319.pdf"],
    ],
  },
  aai: {
    name: "Airports Authority of India (AAI)",
    country: "India",
    directory: "aai-india",
    license: "Copyright Airports Authority of India; verify reuse terms before redistribution",
    indexBase: "https://aim-india.aai.aero/eaip/eaip-v2-06-2026/eAIP/",
    airports: [
      ["VIDN", "Dehradun"],
      ["VOPB", "Port Blair"],
      ["VEMN", "Dibrugarh"],
      ["VOPC", "Puducherry"],
      ["VOBZ", "Vijayawada"],
    ],
  },
};

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#039;", "'");
}

async function fetchWithRetry(url, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.ok) return response;
    if (attempt === attempts || ![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`${response.status} ${response.statusText}: ${url}`);
    }
    const retryAfter = response.headers.get("retry-after");
    const delay = retryAfter ? Number(retryAfter) * 1000 : attempt * 3000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function fetchText(url) {
  return (await fetchWithRetry(url)).text();
}

async function resolveFaa() {
  const source = sourceConfig.faa;
  const xml = await fetchText(source.index);
  return source.airports.map(([code, airport]) => {
    const block = xml.match(new RegExp(`<airport_name[^>]*icao_ident="${code}"[^>]*>[\\s\\S]*?</airport_name>`))?.[0];
    const records = [...(block?.matchAll(/<record>[\s\S]*?<\/record>/g) ?? [])].map(([record]) => record);
    const record = records.find((candidate) => candidate.includes("<chart_code>APD</chart_code>"));
    const pdfName = record?.match(/<pdf_name>([^<]+)<\/pdf_name>/)?.[1];
    if (!pdfName) throw new Error(`FAA airport diagram not found for ${code}`);
    return {
      code,
      airport,
      sourceKey: "faa",
      sourcePage: source.index,
      pdfUrl: new URL(pdfName, source.pdfBase).href,
    };
  });
}

async function resolveDecea() {
  const source = sourceConfig.decea;
  const results = [];
  for (const [code, airport] of source.airports) {
    const sourcePage = `https://aisweb.decea.mil.br/?codigo=${code}&i=aerodromos`;
    const html = await fetchText(sourcePage);
    const section = html.match(/<h4>ADC<\/h4>[\s\S]{0,2500}/)?.[0];
    const href = section?.match(/href="([^"]+)"/)?.[1];
    if (!href) throw new Error(`DECEA ADC not found for ${code}`);
    results.push({ code, airport, sourceKey: "decea", sourcePage, pdfUrl: decodeHtml(href) });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return results;
}

async function resolveAirservices() {
  const source = sourceConfig.airservices;
  const html = await fetchText(source.index);
  return source.airports.map(([code, airport]) => {
    const start = html.search(new RegExp(`<h3[^>]*>[^<]*\\(${code}\\)</h3>`, "i"));
    const block = start >= 0 ? html.slice(start, html.indexOf("<h3", start + 4)) : "";
    const href = block.match(/href=["']?([^"' >]+)["']?>AERODROME CHART(?:\s+-?\s*PAGE 1)?<\/a>/i)?.[1];
    if (!href) throw new Error(`Airservices aerodrome chart not found for ${code}`);
    return {
      code,
      airport,
      sourceKey: "airservices",
      sourcePage: source.index,
      pdfUrl: new URL(href, source.index).href,
    };
  });
}

async function resolveSacaa() {
  const source = sourceConfig.sacaa;
  const html = await fetchText(source.index);
  const rows = [...html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)].map(([row]) => row);
  return source.airports.map(([code, airport]) => {
    const row = rows.find((candidate) => {
      const text = candidate.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      return text.includes(code)
        && /Aerodrome(?:\/Heliport)? Chart/i.test(text)
        && /AD[-_]01/i.test(text);
    });
    const href = row?.match(/href=['"]([^'"]+\.pdf)['"]/i)?.[1];
    if (!href) throw new Error(`SACAA aerodrome chart not found for ${code}`);
    return {
      code,
      airport,
      sourceKey: "sacaa",
      sourcePage: source.index,
      pdfUrl: decodeHtml(href),
    };
  });
}

async function resolveFintraffic() {
  const source = sourceConfig.fintraffic;
  return source.airports.map(([code, airport]) => ({
    code,
    airport,
    sourceKey: "fintraffic",
    sourcePage: source.index,
    pdfUrl: `${source.pdfBase}${code}/EF_AD_2_${code}_ADC.pdf`,
  }));
}

async function resolveLgs() {
  const source = sourceConfig.lgs;
  return source.airports.map(([code, airport, pdfName]) => ({
    code,
    airport,
    sourceKey: "lgs",
    sourcePage: `${source.indexBase}html/eAIP/EV-AD-2.${code}-en-GB.html`,
    pdfUrl: `${source.indexBase}graphics/eAIP/${pdfName}`,
  }));
}

async function resolveAai() {
  const source = sourceConfig.aai;
  return source.airports.map(([code, airport]) => ({
    code,
    airport,
    sourceKey: "aai",
    sourcePage: `${source.indexBase}IN-AD%202.1${code}-en-GB.html`,
    pdfUrl: `${source.indexBase}${code}-ADC.pdf`,
  }));
}

async function downloadAndConvert(entry) {
  const source = sourceConfig[entry.sourceKey];
  const directory = path.join(root, source.directory);
  const svgPath = path.join(directory, `${entry.code}.svg`);
  const relativePath = path.relative(root, svgPath);
  await mkdir(directory, { recursive: true });

  const response = await fetchWithRetry(entry.pdfUrl);
  const pdf = Buffer.from(await response.arrayBuffer());
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error(`Expected PDF for ${entry.code}, received ${response.headers.get("content-type") ?? "unknown content"}`);
  }
  const tempBase = path.join(tmpdir(), `tarmac-${process.pid}-${entry.code}`);
  const pdfPath = `${tempBase}.pdf`;
  const convertedPath = `${tempBase}.svg`;
  await writeFile(pdfPath, pdf);
  await execFileAsync("pdftocairo", ["-f", "1", "-l", "1", "-svg", pdfPath, convertedPath]);
  const svg = await readFile(convertedPath);
  await writeFile(svgPath, svg);

  // Rendering a tiny probe catches malformed conversions without retaining extra PNGs.
  await execFileAsync("rsvg-convert", ["--width", "32", "--output", `${tempBase}.png`, svgPath]);

  return {
    code: entry.code,
    airport: entry.airport,
    country: source.country,
    isUS: source.country === "United States",
    publisher: source.name,
    path: relativePath,
    sourcePage: entry.sourcePage,
    sourcePdf: entry.pdfUrl,
    sourceLicenseNote: source.license,
    sourceFormat: "PDF",
    sourcePageNumber: 1,
    conversion: "pdftocairo -f 1 -l 1 -svg",
    pdfBytes: pdf.length,
    pdfSha256: sha256(pdf),
    svgBytes: svg.length,
    svgSha256: sha256(svg),
  };
}

const entries = [
  ...(await resolveFaa()),
  ...(await resolveDecea()),
  ...(await resolveAirservices()),
  ...(await resolveSacaa()),
  ...(await resolveFintraffic()),
  ...(await resolveLgs()),
  ...(await resolveAai()),
];

const manifestFiles = [];
for (let index = 0; index < entries.length; index += 1) {
  manifestFiles.push(await downloadAndConvert(entries[index]));
  process.stdout.write(`Converted ${index + 1}/${entries.length}: ${entries[index].code}\n`);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const manifest = {
  generatedAt: new Date().toISOString(),
  warning: "TEST FIXTURES ONLY. NOT FOR NAVIGATION.",
  counts: {
    total: manifestFiles.length,
    us: manifestFiles.filter(({ isUS }) => isUS).length,
    international: manifestFiles.filter(({ isUS }) => !isUS).length,
    byPublisher: Object.fromEntries(
      Object.values(sourceConfig).map(({ name }) => [
        name,
        manifestFiles.filter(({ publisher }) => publisher === name).length,
      ]),
    ),
  },
  files: manifestFiles,
};

await writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Wrote manifest.json (${manifest.counts.international} international, ${manifest.counts.us} U.S.)\n`);
