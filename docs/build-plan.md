# TARMAC build plan

A single-page web app that procedurally generates one artifact: an FAA-style airport
diagram for a fictional airport, rendered as SVG, exportable as SVG/PNG. `docs/spec.md`
governs; Part A = what to generate, Part B = how to draw it. Art project: the only
metric is whether a sheet reads as real to someone who knows these charts.

## Stack

Bun + TypeScript. Vite + vanilla TS (or a thin React shell) — anything that serves one
page and hot-reloads. The engine itself is pure TS with zero DOM dependencies:
`generate(seed) → SiteModel` and `render(SiteModel) → SVG string`, so it runs in tests
and in the page identically. Test runner: `bun test`.

## Status & companion docs

- **Phase 0 is done** (scaffold, dev page, CLI renderer, first test suite). The first
  working review found the sheet furniture close to spec and the airfield core (Phases
  1, 4, 5) stubbed — see **`punch-list.md`** for the prioritized fixes; work it in
  order, since P1–P3 dominate whether a sheet reads as real.
- **`harvest.md`** holds proven recipes and tuned constants (H1–H9) distilled from a
  prior generation of this project. When a phase below cites an H-section, start from
  that recipe rather than inventing fresh. `spec.md` still wins on any conflict.

## Phase 0 — Scaffold & harness
- Repo layout: `src/engine/` (pure), `src/app/` (page shell), `test/`, `docs/`,
  `reference/`.
- Dev page: renders the SVG at sheet aspect, seed box + reroll, PNG/SVG export
  (serialize → canvas). Seed in the URL hash.
- A `bun run render <seed> [out.svg]` CLI for tests/screenshots.

## Phase 1 — Geometry kit (the foundation everything leans on)
*(recipes: harvest H1 RNG, H9 traps; punch-list P2)*
- Units: feet in a local tangent plane, +x east, +y north; page projection handled
  only at render time (including whole-sheet landscape rotation).
- Vector/segment/polygon primitives; polygon boolean ops (union, difference) and
  offsetting — pavement is **area geometry**: the taxiway/apron layer must render as a
  single flat-gray union with **fillets at every junction** (spec A3/B4). Build a
  `pavement` builder: centerline + width → ribbon; junction → filleted patch; union all.
- Arc/reverse-curve support (high-speed exits, threshold jogs, entrance-taxiway turns).
- Seeded RNG (string seed → streams), stable across runs.
- Label-placement engine: rectangle collision field over the sheet, placements with
  priorities, leader-line fallback, halo rendering. (Spec B5: zero collisions.)

## Phase 2 — Site model
*(recipes: harvest H2 identity; punch-list P4)*
- Identity: region → city/state/airport name/location ID, lat/lon, elevation, magnetic
  variation, mutually consistent (spec A1).
- Role draw (basic GA → mega hub) → design codes (AAC-ADG-TDG), visibility class.
- Wind axis (+ optional secondary), parcel polygon sized to role, 0–2 edge constraints.

## Phase 3 — Runway solver (spec A2)
*(recipes: harvest H3 numbering/L-C-R/stagger/strength)*
- Primary aligned to wind; length/width from role + elevation/heat.
- Parallel banks at standard separations (700 / 2,500 / 3,100 / ~5,000 ft, staggers);
  optional crosswind runway (edge-placed, shorter, avoids middle thirds); optional
  closed former runway at legacy fields.
- Per-end data: elevations, displaced thresholds, blast pads, EMAS, slope.
- Hard constraints: runways + RPZs inside parcel; RPZs building-free forever after.

## Phase 4 — Taxiway solver (spec A3)
*(recipes: harvest H4 naming/exits/connectivity/hotspots; punch-list P2, P6)*
- Full-length parallels (dual where terminal-side), correct CL separations by class.
- Connector families: end entrances (two 90° turns), mid-field crossings, high-speed
  exits (30°, ~1,500 ft radius, landing-direction), threshold jogs + holding
  bays/bypass stubs at busy ends.
- Naming per EB 89A (letters skip I/O/X; numbered stubs sequential; no runway-number
  collisions). Hold-line positions recorded for rendering.
- Output = centerline graph (for naming/labels) + pavement areas (for drawing).
  Connectivity check: one component, touches every runway.

## Phase 5 — Districts, aprons, buildings (spec A4) — the showpiece
*(recipes: harvest H5 placement registry, cluster recipes, terminal machinery; punch-list P3)*
- Perimeter districting: terminal core, GA+FBO, cargo, military, fuel, fire stations,
  deice/RON at hubs.
- **Terminal grammar module**: compose processor mass + concourses (straight/L/T/Y) +
  satellites + courtyards into intricate silhouettes; archetypes per role (linear,
  pier ensemble, parallel concourse ranks, midfield satellites, unit-terminal
  horseshoe, semicircular linears). Apron hugs the silhouette; discrete staggered
  throats onto taxiways. `docs/terminal-design.md` is the authoritative reference for
  configurations, dimensions, growth patterns, and named real-world silhouettes —
  build the grammar's vocabulary and its dimensional ranges from that file.
- Hangar grammar (T-hangar bars, box hangars, maintenance sheds), tie-down grids,
  tower placement with sightlines, BRL setbacks.
- This module deserves the most iteration time; budget accordingly and screenshot
  against MSP/ORD/ATL terminal silhouettes.

## Phase 6 — Operational data (spec A5)
*(recipes: harvest H6 builders)*
- Frequencies by role (sectored at hubs), ramp tables, PCN strings, hotspot derivation
  at genuinely confusable geometry, LAHSO/ILS-hold placement, notes (ASDE-X, RSL),
  valid Julian revision date / top-only AL number / volume-date strings.

## Phase 7 — Renderer (spec Part B)
*(recipes: harvest H7 text/placer/symbols/constants; punch-list P1, P5, P7, P8)*
- Sheet: IAC top/bottom margin topology, neatline (0.010″), rotated volume strings,
  and an east-west inside-neatline rotation mode.
- Graticule: solid lines + perpendicular ticks, plain labels (B3).
- Airfield: runways with full annotation set; pavement union in #CFCFCF; buildings
  black; hotspots #945101 above all ink; symbol library (beacon star, chevrons, EMAS,
  displaced thresholds, LAHSO loops, approach-light miniatures, circled letters,
  wind cone, circle-H).
- Furniture: comm block, FIELD ELEV, mag-var assembly, cautions, PCN block, lighting
  notes, ramp table — all through the label-placement engine.
- Ink discipline enforced in one theme module: two line weights, one gray, one brown,
  one type family, boxed-items whitelist (B2).

## Phase 8 — Conformance tests (property assertions from the spec)
Write as `bun test` suites over many seeds (e.g. 200), plus SVG-level checks that also
run against the four real SVGs in `reference/real-diagrams/` — the real charts should
pass every *rendering-convention* test (don't overfit layout tests to those four
airports; they're a sample, not the population).

Rendering-convention properties (must pass for real SVGs and generated output):
- Ink palette ⊆ {black, white, #CFCFCF gray family, #945101/#955101 brown}.
- Thin-line stroke widths cluster at two spec weights; no stroke zoo.
- No boxed taxiway letters / runway-end ELEVs / graticule labels (boxed-items
  whitelist only).
- Graticule lines solid, ≥2 per axis, labeled with degree-minute strings.
- Margin grammar present: AIRPORT DIAGRAM ×2, AL-number, name+(ID)+city ×2, volume
  strings ×2.

Generated-model properties (spec Part A):
- Runway headings/numbering consistent; parallels share heading family with L/C/R.
- Parallel separations ∈ standard families; crossers avoid middle thirds; RPZs
  building-free; everything inside parcel.
- Every active runway has a full-length parallel taxiway; network is one connected
  component; taxiway names legal per EB 89A; no name/runway-number collisions.
- Junction geometry: no unfilleted right-angle pavement corners (measure curvature at
  junction boundaries).
- Label collision count = 0; field bbox occupies 40–70% of plot height; white space
  present above/below.
- Hotspots coincide with runway crossings or threshold connector clusters.
- Determinism: same seed → byte-identical SVG.

## Phase 9 — Controls (last, after the engine settles)
*(recipes: harvest H8 IO/app shell)*
Whatever the finished engine's real degrees of freedom turn out to be — likely just:
seed, role/archetype override, region, era, texture density, theme. Keep the page a
chart with a whisper of UI; controls are a garnish, not the product.

## Working method
- After every phase, render a spread of seeds (GA / regional / hub / mega) and eyeball
  against the reference charts before moving on; the spec's success criterion is
  visual, and drift compounds.
- When a question isn't answered by the spec, measure the answer from the reference
  SVGs (they are ground truth for conventions) and record the ruling as a new bullet
  in `docs/spec.md` so the spec stays the single source of truth.
