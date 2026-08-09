// Render the curated fixture manifest (plus optional extra seeds) into a single
// reviewable HTML contact sheet: `bun run contact-sheet [output.html]`.
import { generate, render } from "../src/engine";
import { fixtures } from "../test/fixtures/seeds";

const output = Bun.argv[2] ?? "tmp/contact-sheet.html";

const cells = fixtures.map((fixture) => {
  const model = generate(fixture.seed, fixture.options);
  const svg = render(model);
  const meta = `${model.role} · ${model.terminalArchetype} · ${model.runways.length} rwy · ${model.terminal ? `${model.terminal.units.length} unit(s), ${model.terminal.gatesPlanned} gates` : "no terminal"}`;
  return `<figure><figcaption><strong>${fixture.name}</strong> — ${fixture.why}<br><code>${fixture.seed}</code> · ${meta}</figcaption>${svg}</figure>`;
});

const html = `<!doctype html><meta charset="utf-8"><title>tarmac contact sheet</title>
<style>
  body { font: 13px/1.4 system-ui; margin: 20px; background: #eee; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 18px; }
  figure { margin: 0; background: #fff; padding: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
  figcaption { margin-bottom: 8px; }
  svg { width: 100%; height: auto; }
</style>
<h1>tarmac contact sheet — ${fixtures.length} fixtures</h1>
<main>${cells.join("\n")}</main>`;

await Bun.write(output, html);
console.log(`Wrote ${fixtures.length} sheets → ${output}`);
