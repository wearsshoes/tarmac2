// Reference-corpus measurements (test-suite-spec.md). The checked-in real SVGs are
// pdftocairo exports of published charts — measurements, not project-owned markup.
// Text in them is outlined (no <text> nodes), so assertions stay at the ink level.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rgbPercentColors, strokeWidths } from "./helpers/svg";

const corpusDir = new URL("../reference/real-airports/", import.meta.url).pathname;

interface ManifestFile {
  code: string;
  publisher: string;
  isUS: boolean;
  path: string;
  svgBytes: number;
}

const manifest = (await Bun.file(join(corpusDir, "manifest.json")).json()) as { counts: { total: number }; files: ManifestFile[] };
const present = manifest.files.filter((f) => existsSync(join(corpusDir, f.path)));
const missing = manifest.files.filter((f) => !existsSync(join(corpusDir, f.path)));

// FAA ink families in pdftocairo rgb-percent syntax. A color is conforming when it
// is grayscale (black/white/pavement screens) or the hotspot brown family.
function isConformingInk([r, g, b]: [number, number, number]): boolean {
  const grayscale = Math.abs(r - g) < 1.5 && Math.abs(g - b) < 1.5;
  const brown = Math.abs(r - 58.4) < 2 && Math.abs(g - 31.8) < 2 && Math.abs(b - 0.4) < 2;
  return grayscale || brown;
}

describe("reference corpus integrity", () => {
  test("known drift only: manifest entries missing on disk are the two documented ones", () => {
    // FAOR.svg and FALE.svg are listed in the manifest but were never landed.
    expect(missing.map((f) => f.code).sort()).toEqual(["FALE", "FAOR"]);
    expect(present.length).toBe(manifest.counts.total - 2);
  });

  for (const entry of present) {
    test(`${entry.code} (${entry.publisher.split(" ")[0]}) parses as a chart-sized SVG`, async () => {
      const svg = await Bun.file(join(corpusDir, entry.path)).text();
      expect(svg).toContain("<svg");
      expect(svg.trimEnd().endsWith("</svg>")).toBeTrue();
      expect(svg.length).toBeGreaterThan(10_000);
    });
  }
});

describe("FAA rendering conventions (measured)", () => {
  for (const entry of present.filter((f) => f.isUS)) {
    test(`${entry.code} uses the FAA ink system`, async () => {
      const svg = await Bun.file(join(corpusDir, entry.path)).text();

      const colors = rgbPercentColors(svg);
      expect(colors.length).toBeGreaterThan(0);
      for (const color of colors) {
        if (!isConformingInk(color)) throw new Error(`${entry.code}: non-conforming ink rgb(${color.join("%, ")}%)`);
      }
      // Black ink and the pavement screen are always present.
      expect(colors.some(([r, g, b]) => r < 1 && g < 1 && b < 1)).toBeTrue();
      expect(colors.some(([r]) => Math.abs(r - 81.2) < 1)).toBeTrue();

      // Two-weight line discipline: 0.39 pt dominates; everything stays thin.
      const widths = strokeWidths(svg);
      expect(widths.length).toBeGreaterThan(0);
      const thin = widths.filter((w) => Math.abs(w - 0.39) < 0.001).length;
      expect(thin / widths.length).toBeGreaterThan(0.8);
      for (const width of widths) expect(width).toBeLessThanOrEqual(1.5);
    });
  }
});
