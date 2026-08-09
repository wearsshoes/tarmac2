// SVG text/structure inspection shared by chart and reference suites.

/** All six-digit hex colors used in an SVG, uppercased. */
export function hexColors(svg: string): Set<string> {
  return new Set((svg.match(/#[0-9a-fA-F]{6}/g) ?? []).map((c) => c.toUpperCase()));
}

/** All rgb(r%, g%, b%) colors as numeric triples (pdftocairo output style). */
export function rgbPercentColors(svg: string): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (const m of svg.matchAll(/rgb\(([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)%\)/g)) {
    out.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  return out;
}

/** All stroke widths, from both attribute and style syntax. */
export function strokeWidths(svg: string): number[] {
  const attr = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
  const style = [...svg.matchAll(/stroke-width:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  return [...attr, ...style];
}

/** Inner markup of a `<g id="...">` group. */
export function groupContent(svg: string, id: string): string {
  return svg.match(new RegExp(`<g id="${id}">(.*?)</g>`, "s"))?.[1] ?? "";
}

export function dataAttr(svg: string, name: string): string | undefined {
  return svg.match(new RegExp(`data-${name}="([^"]*)"`))?.[1];
}
