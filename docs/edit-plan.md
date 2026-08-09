# Overall edit plan for the next code pass

## Purpose

This is the dependency-ordered implementation plan that replaces the original
`build-plan.md` and first-review `punch-list.md` as the active backlog. It incorporates
the visual corpus audit, the full IAC 9 review, the MWAA Design Manual pass, and the FAA
AC 150/5370-10H construction-standards pass.

No code was changed during the investigation pass. The next pass should preserve that
separation by treating each phase below as a reviewable code-and-test slice.

## Governing decisions

1. `docs/spec.md` is normative. This plan sequences it; it does not override it.
2. The engine produces a publisher-neutral airport model. An explicit FAA-IAC profile
   selects chart content and portrayal.
3. Geometry is generated from operational and site causes. Randomness selects among
   plausible solutions; it does not create unexplained vertices.
4. Material, physical lifecycle, operational availability, marking state, and chart
   portrayal are independent axes.
5. Terminal buildings, aprons, taxilanes, landside access, and growth phases are one
   coordinated subsystem. See `terminal-generator-plan.md`.
6. Semantic model assertions, geometric assertions, SVG-structure assertions, and visual
   comparisons are different test layers. See `test-suite-spec.md`.
7. Determinism means the same version, seed, and options produce the same result. It does
   not mean obsolete RNG draw order or current SVG bytes can never change.

## Current architectural seams to remove

| Current seam | Why it blocks the spec | Intended destination |
|---|---|---|
| `Runway.closed?: boolean` | Cannot express partial removal, construction, restriction, repurposing, or independent marking state. | Segment-level surface lifecycle and availability records. |
| `Apron` as kind + polygon | Function, circulation, material, stands, subdivisions, and phase are collapsed. | Surface regions plus apron-operation graph and edge roles. |
| `Building` as kind + label + polygon | No terminal/concourse/gate hierarchy, phase, frontage, or connector semantics. | Facility hierarchy with generated geometry as one output. |
| `TerminalArchetype` selected directly from role | Produces shape first and operational explanation afterward. | Terminal program + site envelope → morphology family → phased composition. |
| One stepped terminal-apron polygon | Overpaves landside courts and invents repeated rectangular throats. | Gate-face bands + taxilanes + route-derived throats + purposeful residual pavement. |
| Taxiways stored only as polylines | Renderer must approximate area geometry and junctions independently. | Centerline graph plus derived, unioned surface geometry. |
| Located assets represented as notes | Wind cones, visual aids, signs, lights, fences, and similar objects cannot be validated spatially. | Typed, located assets selected by publisher profile. |
| `SiteModel` doubles as chart document | Multi-panel/inset/layout logic has nowhere to live. | Airport model → publication selection → chart document → SVG. |
| Regex-heavy tests over serialized SVG | Fragile to markup changes and weak on semantics. | Layered semantic, geometry, DOM/structure, and image tests. |

## Phase sequence

| Phase | Outcome | Depends on |
|---|---|---|
| 0 | Correct baseline, fixture manifest, and test harness | — |
| 1 | Publisher-neutral model and explicit state decomposition | 0 |
| 2 | Stable RNG streams and reusable area-geometry operations | 1 |
| 3 | Site, runway, and taxiway solvers emit valid semantic geometry | 2 |
| 4 | Surface, marking, lifecycle, and operation layers are coherent | 2–3 |
| 5 | Terminal/district/apron subsystem is rebuilt from programs and flows | 2–4 |
| 6 | Common located facilities and causal site services are modeled | 1–5 |
| 7 | FAA-IAC chart-document builder and renderer are brought to conformance | 1–6 |
| 8 | Population calibration, visual regression, UI/export, and cleanup | 0–7 |

Phases are ordered by data dependency, not by visual prominence. Phase 5 may be developed
in small internal slices, but it should not be bolted onto the current surface model.

## Phase 0 — Baseline and test migration

### Scope

- Create a checked-in fixture manifest containing a compact cross-product of roles,
  terminal families, site regimes, orientations, and special surface states.
- Record semantic summaries for the fixture seeds before restructuring the model. Keep
  the current SVG batch as investigation evidence, not permanent byte goldens.
- Split `test/engine.test.ts` by concern so failures identify model, geometry, renderer,
  or population behavior.
- Migrate `test/reference.test.ts` from the removed `reference/real-diagrams/*.svg` paths
  to the current `reference/real-airports/manifest.json` and publisher directories.
- Add test helpers for polygon validity, segment distance, graph reachability, edge-role
  coverage, and SVG layer inspection instead of duplicating local approximations.
- Correct current assertions that conflict with the researched contract:
  - `AL-nnn (FAA)` is a top-margin item; do not require it twice.
  - a visual GA runway need not always have a full-length parallel taxiway;
  - do not impose an invented minimum distance between hotspots;
  - do not freeze exact SVG bytes across intentional renderer changes;
  - do not accept a tiny placeholder polygon as proof that a ramp subdivision exists.

### Target files

- `test/engine.test.ts`, `test/reference.test.ts`
- new test helpers and fixture manifests under `test/`
- `package.json` only if a deliberately selected SVG/XML or image-comparison dependency
  is needed

### Exit criteria

- Existing behavior is covered by a clear baseline without canonizing known defects.
- The test command reports suites by layer and completes deterministically.
- Every later phase has a named fixture and acceptance-test location.

## Phase 1 — Model boundaries and state decomposition

### Scope

Refactor types before changing generation behavior:

- Introduce a `SitePlan`/`DevelopmentContext` for parcel, constrained regions, sub-area
  envelopes, access corridors, drainage/utility/perimeter corridors, inherited features,
  era, and growth reserves.
- Replace boolean runway closure with physical surface segments carrying:
  `function`, `material`, `physicalState`, `operationalState`, `markingState`, and phase.
- Preserve runway operational identity separately from the pavement that may remain after
  removal or repurposing.
- Introduce stable facility identity and relationships: terminal, processor, concourse,
  pier, satellite, gate face, gate/stand, connector, building, and district.
- Introduce a generic located-asset envelope with discriminated records for assets that
  enter near-term scope: wind indicator, beacon/tower, visual aid, sign/light system,
  fence/gate, service road, drainage feature, and optional obstruction.
- Separate `AirportModel` from `ChartDocument`. The chart document contains selected
  layers, insets, tables, notes, and page-placement requirements for a publisher profile.
- Keep units in feet and coordinates publisher-neutral.

Avoid a single giant interface whose optional fields recreate the current ambiguity.
Use discriminated unions and explicit parent IDs where category behavior differs.

### Target files

- `src/engine/types.ts`
- `src/engine/index.ts`
- temporary compatibility/adaptation module if needed to keep slices reviewable

### Exit criteria

- The type system can represent every IAC runway lifecycle scenario without visual flags.
- A terminal/concourse hierarchy is representable without inferring it from labels.
- Asphalt, concrete, aggregate-turf, and fuel-resistant surface are representable without
  choosing a render color.
- All current generator output can be adapted into the new types while later solvers are
  still being migrated.

## Phase 2 — RNG and geometry foundation

### Scope

- Fork deterministic RNG streams by subsystem (`identity`, `site`, `runways`, `taxiways`,
  `terminal-program`, `terminal-morphology`, `surfaces`, `assets`, `chart-layout`). A
  terminal outline edit must not rename the airport or rotate its runways.
- Add robust polyline offset/ribbon, polygon offset, union, difference, intersection,
  clipping, fillet, arc, and validity operations. Select a well-tested geometry library
  if it materially reduces risk; isolate it behind project-owned interfaces.
- Represent centerline graphs independently from their derived area geometry.
- Add oriented bounding boxes, closest-feature queries, clearance envelopes, and
  explainable constraint failures.
- Use retry budgets with deterministic candidate streams. A failed placement must report
  which constraint failed instead of silently taking the first unsafe fallback.

### Target files

- `src/engine/rng.ts`, `src/engine/geometry.ts`
- new focused geometry/graph modules under `src/engine/`

### Exit criteria

- Geometry operations pass unit and randomized validity tests.
- Adding a random draw in one subsystem leaves unrelated fixture summaries unchanged.
- No emitted polygon is self-intersecting, zero-area, non-finite, or dependent on
  renderer-side repair.

## Phase 3 — Site, runway, and taxiway solvers

### Scope

- Generate the site/development context before operating surfaces.
- Rework runway choice from wind coverage, critical aircraft/design codes, site regime,
  elevation/temperature, capacity, and inherited-field era.
- Represent runway banks, crosswind families, displaced thresholds, stopway/blast/EMAS,
  protection surfaces, and lifecycle segments without conflating them.
- Apply the corrected parallel-taxiway rule: required for sub-one-mile approach
  minimums, preferred for other instrument runways, optional with turnarounds for basic
  visual GA.
- Generate a named taxiway graph first, then derive ribbons, fillets, exits, crossovers,
  threshold jogs, holding bays, and connectors.
- Connect every operational runway access point and every district/apron collector that
  requires aircraft access; do not repair connectivity with anonymous straight chords
  through protected areas.

### Target files

- `src/engine/generator.ts`
- new `site`, `runway`, and `taxiway` modules
- `src/engine/identity.ts` where site regime and fictional geography interact

### Exit criteria

- All geometry and topology assertions in `test-suite-spec.md` pass over the population
  corpus.
- No building, apron, or service district is used to retroactively justify an unsafe
  runway/taxiway solution.
- Failures are deterministic and diagnostic.

## Phase 4 — Surfaces, markings, lifecycle, and operations

### Scope

- Build one physical surface system from runway, taxiway, taxilane, apron, shoulder,
  road, pad, and residual-pavement regions.
- Assign material from function, load, site, and phase without using material as a proxy
  for district identity.
- Generate segment-level new/existing/overlaid/repaired/removed/temporary states and
  active/restricted/closed/under-construction/repurposed operational states.
- Generate markings as related objects with their own standard/temporary/removed/absent
  state. Marking design comes from the applicable design rule, not AC 150/5370-10H.
- Preserve pavement phase seams only where they are causally meaningful.
- Expose a publication-selection query that maps these facts to IAC lifecycle symbols.

### Target files

- new surface and marking modules
- runway/taxiway generators and renderer adapter

### Exit criteria

- One fixture expresses each IAC runway lifecycle portrayal from publisher-neutral facts.
- Operational network checks ignore closed or removed segments while physical rendering
  may still include residual pavement.
- Default FAA output does not texture asphalt versus concrete.

## Phase 5 — Terminal, district, and apron rebuild

Implement `terminal-generator-plan.md` in its internal stages:

1. terminal program and hierarchy;
2. site envelope and landside approach;
3. morphology/composition graph;
4. edge roles and gate modules;
5. apron taxilanes, stands, collectors, and throats;
6. phased growth and inherited irregularity;
7. neighboring GA, cargo, maintenance, RON, deicing, military, and fire/service districts.

Remove the current `steppedEdge` and terminal bounding-rectangle behavior after its
replacement fixtures pass. Do not preserve it as a fallback for hub-scale terminals.

### Target files

- `src/engine/terminal.ts` (likely split into focused terminal modules)
- district-building logic currently embedded in `src/engine/generator.ts`
- surface and site-plan modules

### Exit criteria

- Every gate-bearing face is served by an appropriate apron band and taxilane.
- Landside faces and road courts remain non-apron.
- Every apron throat is traceable to an internal collector route.
- Terminal hierarchy, count, and detached components are semantically stable.
- Role/archetype/site fixture sheets are visually distinguishable without arbitrary
  silhouette noise.

## Phase 6 — Located facilities and causal site services

### Near-term common core

- wind cones/indicators, tower/beacon identity, PAPI/VASI and approach-light records;
- service/perimeter/emergency roads, fire response courts, fence/gate topology;
- deicing collection relation, drainage corridors/ponds where they shape geometry;
- helipads, run-up/holding pads, arresting gear, non-movement boundaries;
- structured notes, declared distances, lighting facts, and hotspot explanations needed
  by the FAA chart profile.

### Deferred unless a profile or fixture requires them

- complete underground utilities and detailed electrical circuits;
- all construction-specification asset types;
- obstacle tables removed from the default current FAA Airport Diagram;
- international publisher color systems and multi-panel technical diagrams;
- aircraft/GSE simulation beyond the envelopes needed to validate stands and routes.

### Exit criteria

- Every rendered located symbol is backed by a typed object at a valid location.
- Unrendered causal systems can constrain geometry without leaking into FAA output.
- No generic prose note substitutes for structured data used elsewhere on the chart.

## Phase 7 — Chart-document builder and FAA-IAC renderer

### Scope

- Add an explicit `faa-iac-2025` profile that selects map objects, notes, tables, page
  format, lifecycle portrayals, and symbol variants.
- Build a chart document before SVG serialization: plan-view transform, graticule,
  margin fields, annotation candidates, insets/tables, and layer order.
- Correct margin topology, top-only AL reference, rotated inside-neatline content,
  runway annotations, plain/boxed label whitelist, hotspot spelling decision, located
  visual aids, and IAC lifecycle symbology.
- Render surface area geometry as a coherent union while retaining semantic SVG groups
  and stable `data-*` hooks for tests.
- Use one style/token module for colors, type, line weights, halos, and symbol sizes.
- Keep collision placement deterministic and report unresolved items; never silently
  drop required labels.

### Target files

- `src/engine/renderer.ts` (split into chart document, layout, symbols, and serializer)
- renderer-layout helpers and theme/profile modules

### Exit criteria

- The FAA profile passes the IAC acceptance scenarios and renderer structure suite.
- Generated sheets use the correct page/margin mode and contain zero unresolved required
  label collisions.
- Chart rendering does not mutate or reinterpret airport operational facts.

## Phase 8 — Calibration, app, export, and cleanup

### Scope

- Run population tests and visual contact sheets across the fixture manifest plus a
  larger deterministic seed corpus.
- Compare composition, topology, terminal/apron morphology, and furniture density to the
  real FAA set; use metrics as diagnostics, not targets to game.
- Add stable raster visual regression in a pinned environment after the major renderer
  rewrite settles.
- Update the app controls to expose only real degrees of freedom: seed, role, site
  regime/era, terminal-family override where valid, feature density, and publisher
  profile.
- Verify SVG/PNG export, metadata, accessibility text, and absence of debug layers.
- Remove compatibility types, dead generators, placeholder ramp polygons, and obsolete
  tests only after replacement coverage passes.

### Exit criteria

- The curated fixture set is approved visually and passes all automated tiers.
- Population tests show variety without constraint violations or mode collapse.
- `bun run build`, `bun test`, and the render/export smoke suite pass from a clean clone.
- Documentation links and status statements match the code that ships.

## Review slices and commit boundaries

Prefer these reviewable boundaries:

1. test harness and corrected baseline;
2. type/model split with adapter and no intended visual change;
3. RNG/geometry foundation;
4. runway/taxiway migration;
5. surface/lifecycle/marking migration;
6. terminal program and hierarchy;
7. terminal/apron geometry and district integration;
8. located common objects;
9. chart-document and FAA renderer correction;
10. visual calibration, app controls, cleanup, and docs.

Each slice should include its tests, fixture updates, and any `spec.md` clarification. Do
not combine a broad model migration with unreviewed visual retuning.

## Definition of done for the next code pass

The pass is complete when the engine can generate a publisher-neutral, internally
consistent airport; build an explicit FAA-IAC 2025 chart document from it; render sheets
whose runway/taxiway/terminal/apron topology and page grammar survive both automated and
visual review; and explain every material boundary, closure symbol, apron edge, terminal
component, and rendered located asset through first-class model data.
