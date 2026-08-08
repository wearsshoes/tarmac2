import "./styles.css";
import { generate, render, type Role } from "../engine";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app root");

const roles: Array<{ value: "auto" | Role; label: string }> = [
  { value: "auto", label: "Auto role" }, { value: "basic-ga", label: "Basic GA" },
  { value: "business-ga", label: "Business GA" }, { value: "regional", label: "Regional" },
  { value: "mid-hub", label: "Mid hub" }, { value: "major-hub", label: "Major hub" },
  { value: "mega-hub", label: "Mega hub" },
];

app.innerHTML = `
  <header class="masthead">
    <a class="wordmark" href="#" aria-label="Tarmac home"><span>TARMAC</span><small>SYNTHETIC AIRFIELD STUDIES</small></a>
    <div class="actions">
      <label class="seed-field"><span>SEED</span><input id="seed" autocomplete="off" spellcheck="false" /></label>
      <label class="role-field"><span class="sr-only">Airport role</span><select id="role">${roles.map((r) => `<option value="${r.value}">${r.label}</option>`).join("")}</select></label>
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
const chart = document.querySelector<HTMLElement>("#chart")!;
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

function hashState(): { seed: string; role: "auto" | Role } {
  const raw = decodeURIComponent(location.hash.slice(1));
  const [seed = "", role = "auto"] = raw.split("/");
  const validRole = roles.some((item) => item.value === role) ? role as "auto" | Role : "auto";
  return { seed: seed.trim() || randomSeed(), role: validRole };
}

function setHash(seed: string, role: string): void {
  const suffix = role === "auto" ? "" : `/${role}`;
  history.replaceState(null, "", `#${encodeURIComponent(seed)}${suffix}`);
}

function draw(): void {
  const seed = seedInput.value.trim() || randomSeed();
  const selectedRole = roleSelect.value as "auto" | Role;
  setHash(seed, selectedRole);
  const model = generate(seed, selectedRole === "auto" ? {} : { role: selectedRole });
  currentSvg = render(model);
  chart.innerHTML = currentSvg;
  airportId.textContent = model.identity.id;
  airportName.textContent = model.identity.airportName;
  airportMeta.textContent = `${model.role.replaceAll("-", " ")} · ${model.terminalArchetype} · ${model.runways.length} RWY`;
  document.title = `${model.identity.id} — Tarmac`;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeSeed = (): string => seedInput.value.replace(/[^A-Za-z0-9_-]/g, "_");

function exportSvg(): void {
  download(new Blob([currentSvg], { type: "image/svg+xml;charset=utf-8" }), `tarmac-${safeSeed()}.svg`);
}

function exportPng(): void {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([currentSvg], { type: "image/svg+xml;charset=utf-8" }));
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
draw();

document.querySelector("#reroll")!.addEventListener("click", () => { seedInput.value = randomSeed(); draw(); });
document.querySelector("#svg-export")!.addEventListener("click", exportSvg);
document.querySelector("#png-export")!.addEventListener("click", exportPng);
seedInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { seedInput.blur(); draw(); } });
seedInput.addEventListener("change", draw);
roleSelect.addEventListener("change", draw);
window.addEventListener("hashchange", () => { const state = hashState(); seedInput.value = state.seed; roleSelect.value = state.role; draw(); });
