import "./styles.css";
import { generate, render, type Role, type TerminalArchetype } from "../engine";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app root");

const roles: Array<{ value: "auto" | Role; label: string }> = [
  { value: "auto", label: "Auto role" }, { value: "basic-ga", label: "Basic GA" },
  { value: "business-ga", label: "Business GA" }, { value: "regional", label: "Regional" },
  { value: "mid-hub", label: "Mid hub" }, { value: "major-hub", label: "Major hub" },
  { value: "mega-hub", label: "Mega hub" },
];

const regions = ["auto", "americas", "europe", "asia", "oceania", "africa"] as const;

// Archetypes offered per role — mirrors the generator's role priors; the
// engine still downgrades infeasible choices.
const ARCHETYPES: Record<Role, TerminalArchetype[]> = {
  "basic-ga": [], "business-ga": ["linear"], regional: ["linear", "pier"],
  "mid-hub": ["pier", "parallel", "unit"], "major-hub": ["pier", "parallel", "satellite", "unit", "semicircle"],
  "mega-hub": ["pier", "parallel", "satellite", "unit", "semicircle"],
};

app.innerHTML = `
  <header class="masthead">
    <a class="wordmark" href="#" aria-label="Tarmac home"><span>TARMAC</span><small>SYNTHETIC AIRFIELD STUDIES</small></a>
    <div class="actions">
      <label class="seed-field"><span>SEED</span><input id="seed" autocomplete="off" spellcheck="false" /></label>
      <label class="role-field"><span class="sr-only">Airport role</span><select id="role">${roles.map((r) => `<option value="${r.value}">${r.label}</option>`).join("")}</select></label>
      <label class="role-field"><span class="sr-only">Region</span><select id="region">${regions.map((r) => `<option value="${r}">${r === "auto" ? "Auto region" : r[0]!.toUpperCase() + r.slice(1)}</option>`).join("")}</select></label>
      <label class="role-field"><span class="sr-only">Terminal archetype</span><select id="archetype"><option value="auto">Auto terminal</option></select></label>
      <button id="reroll" class="icon-button" type="button" title="Generate another airport" aria-label="Generate another airport">↻</button>
      <span class="divider"></span>
      <button id="svg-export" class="text-button" type="button">SVG</button>
      <button id="png-export" class="text-button" type="button">PNG</button>
    </div>
  </header>
  <section class="workspace">
    <div class="chart-wrap"><div id="chart" class="chart" aria-live="polite"></div></div>
    <aside class="caption" aria-label="Generated airport details">
      <span id="airport-id"></span>
      <strong id="airport-name"></strong>
      <span id="airport-meta"></span>
    </aside>
  </section>`;

const seedInput = document.querySelector<HTMLInputElement>("#seed")!;
const roleSelect = document.querySelector<HTMLSelectElement>("#role")!;
const regionSelect = document.querySelector<HTMLSelectElement>("#region")!;
const archetypeSelect = document.querySelector<HTMLSelectElement>("#archetype")!;
const chart = document.querySelector<HTMLElement>("#chart")!;

/** Archetype menu only offers options valid for the selected role. */
function syncArchetypeOptions(): void {
  const role = roleSelect.value as "auto" | Role;
  const valid = role === "auto" ? [] : ARCHETYPES[role];
  const current = archetypeSelect.value;
  archetypeSelect.innerHTML = `<option value="auto">Auto terminal</option>${valid.map((a) => `<option value="${a}">${a[0]!.toUpperCase() + a.slice(1)}</option>`).join("")}`;
  archetypeSelect.value = valid.includes(current as TerminalArchetype) ? current : "auto";
  archetypeSelect.disabled = valid.length === 0;
}
const airportId = document.querySelector<HTMLElement>("#airport-id")!;
const airportName = document.querySelector<HTMLElement>("#airport-name")!;
const airportMeta = document.querySelector<HTMLElement>("#airport-meta")!;
let currentSvg = "";

function randomSeed(): string {
  const adjectives = ["VECTOR", "APRON", "BRAVO", "CROSSWIND", "LOCALIZER", "TAXI", "BEACON", "HOLD"];
  const nouns = ["MERCURY", "CEDAR", "NIGHT", "FALCON", "DELTA", "GRANITE", "NORTH", "SIGNAL"];
  const bytes = new Uint16Array(1); crypto.getRandomValues(bytes);
  return `${adjectives[bytes[0]! % adjectives.length]}-${nouns[Math.floor(bytes[0]! / 7) % nouns.length]}-${String(bytes[0]! % 100).padStart(2, "0")}`;
}

function hashState(): { seed: string; role: "auto" | Role; region: string; archetype: string } {
  const raw = decodeURIComponent(location.hash.slice(1));
  const [seed = "", role = "auto", region = "auto", archetype = "auto"] = raw.split("/");
  const validRole = roles.some((item) => item.value === role) ? role as "auto" | Role : "auto";
  const validRegion = (regions as readonly string[]).includes(region) ? region : "auto";
  return { seed: seed.trim() || randomSeed(), role: validRole, region: validRegion, archetype };
}

function setHash(seed: string, role: string, region: string, archetype: string): void {
  const parts = [encodeURIComponent(seed)];
  if (role !== "auto" || region !== "auto" || archetype !== "auto") parts.push(role);
  if (region !== "auto" || archetype !== "auto") parts.push(region);
  if (archetype !== "auto") parts.push(archetype);
  history.replaceState(null, "", `#${parts.join("/")}`);
}

function draw(): void {
  syncArchetypeOptions();
  const seed = seedInput.value.trim() || randomSeed();
  const selectedRole = roleSelect.value as "auto" | Role;
  const selectedRegion = regionSelect.value;
  const selectedArchetype = archetypeSelect.value;
  setHash(seed, selectedRole, selectedRegion, selectedArchetype);
  const model = generate(seed, {
    ...(selectedRole === "auto" ? {} : { role: selectedRole }),
    ...(selectedRegion === "auto" ? {} : { region: selectedRegion }),
    ...(selectedArchetype === "auto" ? {} : { archetype: selectedArchetype as TerminalArchetype }),
  });
  currentSvg = render(model);
  chart.innerHTML = currentSvg;
  airportId.textContent = model.identity.id;
  airportName.textContent = model.identity.airportName;
  airportMeta.textContent = `${model.role.replaceAll("-", " ")} · ${model.terminalArchetype} · ${model.runways.length} RWY`;
  document.title = `${model.identity.id} — Tarmac`;
}

/** Exports carry chart ink only: the data-* debug/test hooks are stripped. */
const exportMarkup = (): string => currentSvg.replace(/ data-[a-z-]+="[^"]*"/g, "");

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeSeed = (): string => seedInput.value.replace(/[^A-Za-z0-9_-]/g, "_");

function exportSvg(): void {
  download(new Blob([exportMarkup()], { type: "image/svg+xml;charset=utf-8" }), `tarmac-${safeSeed()}.svg`);
}

function exportPng(): void {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([exportMarkup()], { type: "image/svg+xml;charset=utf-8" }));
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1800; canvas.height = 2400;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => { if (blob) download(blob, `tarmac-${safeSeed()}@2x.png`); }, "image/png");
    URL.revokeObjectURL(url);
  };
  image.src = url;
}

const initial = hashState();
seedInput.value = initial.seed;
roleSelect.value = initial.role;
regionSelect.value = initial.region;
syncArchetypeOptions();
archetypeSelect.value = [...archetypeSelect.options].some((option) => option.value === initial.archetype) ? initial.archetype : "auto";
draw();

document.querySelector("#reroll")!.addEventListener("click", () => { seedInput.value = randomSeed(); draw(); });
document.querySelector("#svg-export")!.addEventListener("click", exportSvg);
document.querySelector("#png-export")!.addEventListener("click", exportPng);
seedInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { seedInput.blur(); draw(); } });
seedInput.addEventListener("change", draw);
roleSelect.addEventListener("change", draw);
regionSelect.addEventListener("change", draw);
archetypeSelect.addEventListener("change", draw);
window.addEventListener("hashchange", () => {
  const state = hashState();
  seedInput.value = state.seed;
  roleSelect.value = state.role;
  regionSelect.value = state.region;
  syncArchetypeOptions();
  archetypeSelect.value = [...archetypeSelect.options].some((option) => option.value === state.archetype) ? state.archetype : "auto";
  draw();
});
