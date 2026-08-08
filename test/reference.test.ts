import { describe, expect, test } from "bun:test";

const diagrams = [
  "KIXD_Airport_Diagram.svg",
  "KTYS_FAA_Airport_Diagram.svg",
  "MSP_Airport_Diagram.svg",
  "ORD_Airport_Diagram.svg",
];

describe("real chart rendering conventions", () => {
  for (const filename of diagrams) test(`${filename} uses the common ink system`, async () => {
    const svg = await Bun.file(new URL(`../reference/real-diagrams/${filename}`, import.meta.url)).text();
    expect(svg).toContain("<svg");
    expect(svg.trimEnd().endsWith("</svg>")).toBeTrue();

    const colors = new Set((svg.match(/#[0-9a-fA-F]{6}/g) ?? []).map((color) => color.toUpperCase()));
    // #D6B785 occurs twice in the legacy MSP source as an export artifact; it is not
    // part of the generated palette. Every other source color is canonical chart ink.
    const sourcePalette = new Set(["#000000", "#FFFFFF", "#CFCFCF", "#945101", "#955101", "#D6B785"]);
    for (const color of colors) expect(sourcePalette.has(color)).toBeTrue();
    expect(colors.has("#000000")).toBeTrue();
    expect(colors.has("#CFCFCF")).toBeTrue();

    const explicitWidths = (svg.match(/stroke-width="[0-9.]+/g) ?? []).map((value) => Number(value.split('"')[1]));
    for (const width of explicitWidths) expect([0.39, 0.42, 0.78]).toContain(width);
  });
});
