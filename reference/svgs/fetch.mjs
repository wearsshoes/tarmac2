#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const files = [
  ["BIKF", "BIKF Layout.svg", "Iceland", "Europe", "derludonaut"],
  ["CYUL", "CYUL Layout.svg", "Canada", "North America", "derludonaut"],
  ["CYYZ", "CYYZ Layout.svg", "Canada", "North America", "derludonaut"],
  ["EDDB", "EDDB Layout.svg", "Germany", "Europe", "derludonaut"],
  ["EDDH", "EDDH Layout.svg", "Germany", "Europe", "derludonaut"],
  ["EDDK", "EDDK Layout.svg", "Germany", "Europe", "derludonaut"],
  ["EDDL", "EDDL Layout.svg", "Germany", "Europe", "derludonaut"],
  ["EGKK", "EGKK Layout.svg", "United Kingdom", "Europe", "derludonaut"],
  ["EGLL", "EGLL Layout.svg", "United Kingdom", "Europe", "derludonaut"],
  ["EHAM", "EHAM Layout.svg", "Netherlands", "Europe", "derludonaut"],
  ["EKCH", "EKCH Layout.svg", "Denmark", "Europe", "derludonaut"],
  ["ELLX", "ELLX Layout.svg", "Luxembourg", "Europe", "derludonaut"],
  ["ENGM", "ENGM Layout.svg", "Norway", "Europe", "derludonaut"],
  ["ESSA", "ESSA Layout.svg", "Sweden", "Europe", "derludonaut"],
  ["KLIA", "KLIA Layout.svg", "Malaysia", "Southeast Asia", "derludonaut"],
  ["LDZA", "LDZA Layout.svg", "Croatia", "Europe", "derludonaut"],
  ["LEBL", "LEBL Layout.svg", "Spain", "Europe", "derludonaut"],
  ["LEMD", "LEMD Layout.svg", "Spain", "Europe", "derludonaut"],
  ["LEPA", "LEPA Layout.svg", "Spain", "Europe", "derludonaut"],
  ["LFPG", "LFPG Layout.svg", "France", "Europe", "derludonaut"],
  ["LFPO", "LFPO Layout.svg", "France", "Europe", "derludonaut"],
  ["LGAV", "LGAV Layout.svg", "Greece", "Europe", "derludonaut"],
  ["LIRF", "LIRF Layout.svg", "Italy", "Europe", "derludonaut"],
  ["LPPT", "LPPT Layout.svg", "Portugal", "Europe", "derludonaut"],
  ["LTBA", "LTBA Layout.svg", "Turkey", "Europe / Asia", "derludonaut"],
  ["MMMX", "MMMX Layout.svg", "Mexico", "North America", "derludonaut"],
  ["OMDB", "OMDB Layout.svg", "United Arab Emirates", "Middle East", "derludonaut"],
  ["RKSI", "RKSI Layout.svg", "South Korea", "East Asia", "derludonaut"],
  ["SBGL", "SBGL Layout.svg", "Brazil", "South America", "derludonaut"],
  ["SBGR", "SBGR Layout.svg", "Brazil", "South America", "derludonaut"],
  ["VHHH", "VHHH Layout.svg", "Hong Kong (China)", "East Asia", "derludonaut"],
  ["VIDP", "VIDP Layout.svg", "India", "South Asia", "derludonaut"],
  ["VTBS", "VTBS Layout.svg", "Thailand", "Southeast Asia", "derludonaut"],
  ["WIII", "WIII Layout.svg", "Indonesia", "Southeast Asia", "derludonaut"],
  ["YMML", "YMML Layout.svg", "Australia", "Oceania", "derludonaut"],
  ["YSSY", "YSSY Layout.svg", "Australia", "Oceania", "derludonaut"],
  ["YSWS", "YSWS Layout.svg", "Australia", "Oceania", "derludonaut"],
  ["ZBAA", "ZBAA Layout.svg", "China", "East Asia", "derludonaut"],
  ["ZBAD", "ZBAD Layout.svg", "China", "East Asia", "derludonaut"],
  ["ZGGG", "ZGGG Layout.svg", "China", "East Asia", "derludonaut"],
  ["ZSPD", "ZSPD Layout.svg", "China", "East Asia", "derludonaut"],
  ["ZUTF", "ZUTF Layout.svg", "China", "East Asia", "derludonaut"],
  ["ZUUU", "ZUUU.svg", "China", "East Asia", "derludonaut"],
  ["WALS", "WALS 2021 Layout.svg", "Indonesia", "Southeast Asia", "jellylovers"],
  ["ATL", "ATL Airport Diagram.svg", "United States", "United States", "faa-naco"],
  ["BOS", "BOS airport diagram.svg", "United States", "United States", "faa-naco"],
  ["BRL", "BRL Airport Diagram.svg", "United States", "United States", "faa-naco"],
  ["CVG", "CVG airport diagram.svg", "United States", "United States", "faa-naco"],
  ["GEG", "GEG airport diagram.svg", "United States", "United States", "faa-naco"],
  ["ISP", "ISP - FAA airport diagram - 0812.svg", "United States", "United States", "faa-naco"],
  ["KSBD", "KSBD Airport Diagram.svg", "United States", "United States", "faa-naco"],
  ["SJC", "SJC Airport Diagram.svg", "United States", "United States", "faa-naco"],
  ["TEB", "Teterboro airport diagram.svg", "United States", "United States", "faa-naco"],
  ["VNY", "VNY - FAA Airport Diagram.svg", "United States", "United States", "faa-naco"],
].map(([code, sourceTitle, country, region, publisher]) => ({
  code,
  sourceTitle,
  country,
  region,
  publisher,
}));

const publisherInfo = {
  derludonaut: {
    name: "DerLudonaut (formerly CellarDoor85)",
    directory: "derludonaut",
    notes: "Community-authored schematic airport layouts hosted by Wikimedia Commons.",
  },
  jellylovers: {
    name: "Jellylovers",
    directory: "jellylovers",
    notes: "Community-authored future-layout diagram hosted by Wikimedia Commons.",
  },
  "faa-naco": {
    name: "U.S. FAA / National Aeronautical Charting Office",
    directory: "faa-naco",
    notes: "FAA diagrams or vector derivatives of FAA diagrams hosted by Wikimedia Commons.",
  },
};

const api = "https://commons.m.wikimedia.org/w/api.php";
const userAgent = "tarmac-airport-diagram-test-corpus/1.0";

function decodeHtml(value = "") {
  return value
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithRetry(url, options = {}, attempts = 8) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      headers: { "User-Agent": userAgent, ...options.headers },
    });
    if (response.ok) return response;
    if (attempt === attempts || ![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`${response.status} ${response.statusText}: ${url}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter)
      ? retryAfter * 1000
      : response.status === 429
        ? attempt * 10000
        : attempt * 1500;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function getMetadata(batch) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|size|mime|sha1|extmetadata",
    titles: batch.map(({ sourceTitle }) => `File:${sourceTitle}`).join("|"),
  });
  const response = await fetchWithRetry(`${api}?${params}`);
  const payload = await response.json();
  return new Map(
    Object.values(payload.query.pages).map((page) => [page.title.replace(/^File:/, ""), page]),
  );
}

const metadata = new Map();
for (let start = 0; start < files.length; start += 45) {
  const batch = files.slice(start, start + 45);
  const result = await getMetadata(batch);
  for (const [title, page] of result) metadata.set(title, page);
}

async function download(entry) {
  const page = metadata.get(entry.sourceTitle);
  const image = page?.imageinfo?.[0];
  if (!image || image.mime !== "image/svg+xml") {
    throw new Error(`Missing SVG metadata for ${entry.sourceTitle}`);
  }

  const publisher = publisherInfo[entry.publisher];
  const relativePath = `${publisher.directory}/${entry.code}.svg`;
  const target = path.join(process.cwd(), relativePath);
  await mkdir(path.dirname(target), { recursive: true });

  let body;
  try {
    const existing = await readFile(target);
    if (createHash("sha1").update(existing).digest("hex") === image.sha1) body = existing;
  } catch {
    // The file has not been downloaded yet.
  }
  if (!body) {
    const response = await fetchWithRetry(image.url.replace(/\?.*$/, ""));
    body = Buffer.from(await response.arrayBuffer());
  }
  const sha1 = createHash("sha1").update(body).digest("hex");
  if (sha1 !== image.sha1) {
    throw new Error(`Checksum mismatch for ${entry.sourceTitle}: ${sha1} != ${image.sha1}`);
  }
  await writeFile(target, body);

  const extra = image.extmetadata ?? {};
  return {
    code: entry.code,
    country: entry.country,
    region: entry.region,
    isUS: entry.country === "United States",
    publisher: publisher.name,
    path: relativePath,
    sourceFile: entry.sourceTitle,
    sourcePage: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(entry.sourceTitle).replaceAll("%20", "_")}`,
    originalUrl: image.url.replace(/\?.*$/, ""),
    description: decodeHtml(extra.ImageDescription?.value),
    author: decodeHtml(extra.Artist?.value),
    credit: decodeHtml(extra.Credit?.value || extra.Source?.value),
    license: extra.LicenseShortName?.value || "Unknown",
    licenseUrl: extra.LicenseUrl?.value || null,
    bytes: body.length,
    sha1,
  };
}

const manifestFiles = [];
for (let index = 0; index < files.length; index += 1) {
  manifestFiles.push(await download(files[index]));
  process.stdout.write(`Downloaded ${index + 1}/${files.length}\n`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const counts = {
  total: manifestFiles.length,
  us: manifestFiles.filter(({ isUS }) => isUS).length,
  international: manifestFiles.filter(({ isUS }) => !isUS).length,
  byPublisher: Object.fromEntries(
    Object.values(publisherInfo).map(({ name }) => [
      name,
      manifestFiles.filter(({ publisher }) => publisher === name).length,
    ]),
  ),
};

await writeFile(
  path.join(process.cwd(), "manifest.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), counts, files: manifestFiles }, null, 2)}\n`,
);

process.stdout.write(`Wrote manifest.json (${counts.international} international, ${counts.us} U.S.)\n`);
