# Updated test-suite specification

## Purpose

The next suite must prove four different things without confusing them:

1. the generated airport is semantically and operationally coherent;
2. its geometry is valid and respects constraints;
3. the FAA-IAC chart document selects and portrays the right facts;
4. the final sheet looks credible across a varied population.

No one test style can cover all four. Model assertions, geometry assertions, SVG
structure checks, raster comparisons, and human review have distinct roles.

## Principles

- Test the earliest authoritative representation. A runway lifecycle rule belongs in a
  model/publication-selection test, not only in an SVG regex.
- Do not trust renderer self-reporting. A `data-label-overlaps="0"` attribute is a useful
  debug hook, not proof that labels do not overlap.
- Keep same-run determinism, but update reviewed fixture expectations when the intentional
  model or renderer contract changes.
- Prefer invariants and metamorphic relations over hard-coded output for population tests.
- Use real diagrams to learn and verify conventions, not to require synthetic airports to
  reproduce the four original sample layouts.
- Keep FAA-IAC conformance separate from international/reference-publisher features.
- Every bug fix adds the smallest seed or synthetic model that would have caught it.

## Test layers

| Layer | Main question | Typical input | Failure meaning |
|---|---|---|---|
| Unit | Does one deterministic primitive obey its contract? | hand-authored points, graphs, RNG seeds | local algorithm defect |
| Model/schema | Can the airport represent valid facts without contradiction? | hand-authored and generated `AirportModel` | semantic/data-model defect |
| Geometry | Are areas, clearances, and networks valid? | generated models and synthetic edge cases | solver or geometry defect |
| Publication selection | Does the FAA profile include/exclude and classify facts correctly? | hand-authored airport facts | source-domain/profile defect |
| Renderer structure | Does SVG serialize the chart document with correct layers and tokens? | hand-authored chart documents | renderer defect |
| Population/property | Does a broad deterministic corpus stay valid and varied? | hundreds/thousands of seeds | mode collapse or rare constraint defect |
| Visual regression | Did composition or symbol appearance change unexpectedly? | curated stable fixture sheets | visual change needing review |
| Reference-corpus analysis | Do measured conventions still support our assertions? | checked-in real SVGs | extractor drift or an overbroad convention |
| Manual visual review | Does the result actually read as a real FAA diagram? | contact sheets against references | aesthetic/system-level defect |

## Proposed organization

Keep the existing Bun runner and split tests by responsibility:

```text
test/
  fixtures/
    seeds.ts                 curated semantic fixture manifest
    models/                  small hand-authored edge-case models
    chart-documents/         publisher-profile/renderer cases
    visual/                  approved raster baselines when enabled
  helpers/
    geometry.ts              authoritative predicates and matchers
    graph.ts                 reachability and path helpers
    model.ts                 semantic summaries and invariant runner
    svg.ts                   XML/layer/token inspection
  unit/
    rng.test.ts
    geometry.test.ts
    naming.test.ts
  model/
    site.test.ts
    runway.test.ts
    taxiway.test.ts
    surfaces.test.ts
    terminal.test.ts
    assets.test.ts
  profiles/
    faa-iac-2025.test.ts
  renderer/
    sheet.test.ts
    symbology.test.ts
    labels.test.ts
  population/
    constraints.test.ts
    diversity.test.ts
  reference/
    faa-conventions.test.ts
  visual/
    fixtures.test.ts
```

The final layout can be flatter if Bun discovery or repository preference favors it, but
the concern boundaries should remain visible in filenames and test descriptions.

## Fixture manifest

Create one typed manifest rather than scattering magic seed strings through tests. Each
fixture declares why it exists and which facts are expected to be stable.

Minimum coverage:

| Fixture family | Required cases |
|---|---|
| Role | basic GA, business GA, regional, mid-hub, major hub, mega hub |
| Site regime | unconstrained inland, constrained urban, coastal/water edge, high/hot, inherited/legacy |
| Orientation/page | primarily north-south, east-west rotated inner chart, oblique |
| Runways | single visual with turnarounds, instrument with full parallel, parallel bank, mixed/crosswind, displaced threshold, EMAS/blast pad |
| Lifecycle | active, indefinitely closed, permanently closed, under construction, partially removed/residual, repurposed, temporary marking |
| Terminal | none/GA, linear, pier, compact satellite, parallel midfield, unit, curvilinear, remote, accreted hybrid |
| Apron | terminal, cargo, GA/hangar, RON, deicing, holding/run-up, military, fire response court |
| Page content | hotspot/inset, declared distances, ramp frequencies, located wind/visual aids, sparse sheet, dense sheet |

Each fixture may freeze:

- seed and generation options;
- a reviewed semantic summary: role, site regime, runway family/count, terminal hierarchy,
  morphology family, phase count, and selected special states;
- selected measurements within tolerances;
- profile-selection results;
- a visual baseline after the renderer stabilizes.

Do not freeze the entire generated JSON or SVG unless the test specifically concerns
serialization determinism.

## Current-test migration

| Current assertion | Action | Replacement |
|---|---|---|
| same seed produces equal model and SVG in the same test run | Keep | Continue exact equality for identical version/options; add stream-isolation metamorphic tests. |
| every active runway has a full-length parallel | Correct | Require it for sub-one-mile minimums, prefer/expect it for other instrument cases, and permit validated turnarounds/holding bays for basic visual GA. |
| hotspots remain 500 ft apart | Remove | Require unique IDs, hazard-linked placement, legible label/leader geometry, and profile-consistent naming; add no arbitrary real-world separation not found in the governing source. |
| `AL-nnn (FAA)` appears at least twice | Correct | Require one top-margin reference and reject a bottom duplicate for the target FAA profile. |
| label collision count is zero because SVG says so | Replace | Test the layout engine's placed rectangles/paths directly; raster/browser measurement is a separate integration check. |
| runway/apron clearance checks only polygon vertices | Strengthen | Use polygon-to-corridor intersection/distance including edge crossings, containment, and buffered clearances. |
| RPZ inside parcel because every RPZ vertex is inside | Strengthen | Test full polygon containment and boundary intersection, including concave parcel cases. |
| real SVG palette/width regexes alone establish conformance | Narrow | Keep as corpus measurements; profile conformance is tested against project-owned chart documents and semantic SVG groups. |
| reference tests read `reference/real-diagrams/*.svg` | Fix fixture source | Read the current `reference/real-airports/manifest.json` and publisher directories; the four legacy paths no longer exist. Select FAA fixtures by manifest metadata or stable airport ID. |
| every open runway is black and every `closed` runway is white | Replace | Test the complete lifecycle-to-IAC portrayal matrix from explicit facts. |
| tiny labeled ramp placeholder counts as a ramp | Reject | Require minimum meaningful region, parent apron relation, taxilane access, and correct label anchor. |

## Unit tests

### RNG

- identical `(seed, stream label)` sequences match;
- different stream labels do not alias;
- adding draws to terminal-detail stream does not change identity/runway summary;
- candidate retry order is deterministic;
- integer ranges are inclusive/exclusive exactly as documented;
- shuffle does not mutate its input;
- all generated values remain finite for empty/degenerate guarded inputs.

### Geometry

- segment intersection covers collinear overlap, endpoint touch, and near-parallel cases;
- point/polygon and polygon/polygon predicates cover holes or explicitly reject them;
- offset/ribbon widths match requested dimensions within tolerance;
- unions/differences preserve area within tolerance and return valid winding;
- fillets are tangent to incoming/outgoing routes and do not create spikes;
- clipping to site envelopes preserves full containment;
- distance between polygons considers vertices, edges, crossing, and containment;
- geometry rejects NaN, infinity, duplicate-point degeneracy, self-intersection, and
  below-minimum area with diagnostic errors.

### Naming and identity

- runway reciprocal designators and L/C/R swaps are correct;
- taxiway names skip I/O/X and avoid confusable runway combinations;
- terminal/concourse IDs are stable and labels do not determine parentage;
- chart cycle/date strings and location identities remain internally consistent.

## Model and geometry invariants

### Site

- all required physical regions lie within the usable parcel or carry an explicit
  permitted off-parcel relation;
- protected areas and building/parked-aircraft clearances use full geometry;
- access, utility, drainage, perimeter, and growth corridors are not silently severed;
- inherited features and phase records have a valid chronological order.

### Runways and surfaces

- runway operational identity is separate from physical surface segments;
- reciprocal end headings differ by 180 degrees and designators match magnetic heading;
- field elevation is derived from valid surveyed/runway points as specified;
- runway family spacing and stagger match a permitted operation category;
- material, physical lifecycle, operational state, and marking state form a valid
  combination;
- partial removal or overlay affects only intended segments;
- active networks do not route through removed or operationally unavailable surfaces;
- residual physical pavement can remain renderable after operational removal.

### Taxiways

- graph connectivity is evaluated at real junctions, not only proximity thresholds;
- each required runway-access and apron-collector node reaches the operating network;
- visual GA without a full parallel has valid end-turnaround/holding access;
- high-speed exits have valid direction, angle/radius range, and landing-flow relation;
- holding positions belong to actual routes and clear protected runway areas;
- fillet/ribbon geometry remains connected without pavement spikes or accidental runway
  crossings.

### Terminal and apron

- terminal count comes from processor/program identity, not building polygons;
- every concourse/pier/satellite has a terminal parent;
- every gate belongs to a valid gate face and aircraft class;
- every gate has passenger, service, and aircraft paths;
- detached components declare a connector type even if the connector is underground;
- gate faces have aircraft apron bands; landside-curb faces do not;
- stand envelopes and pushback paths do not intersect buildings or incompatible stands;
- pier alleys have valid taxilane and end conditions;
- each apron throat is downstream of a collector and joins a usable taxiway;
- landside road/curb access reaches every processor without becoming aircraft pavement;
- phase irregularities cite a phase, route, road, site corridor, or inherited feature;
- no placeholder sub-apron below the minimum operational size satisfies a ramp requirement.

### Located assets and services

- every wind cone, PAPI/VASI, REIL/approach-light, sign/light system, fence/gate, and
  similar rendered item has coordinates and a valid parent/served feature;
- visual aids are on a valid runway side/end and clear incompatible surfaces;
- fire response routes reach required AOA/non-AOA facilities;
- deicing pads connect to departure flow and a collection/treatment relation;
- unrendered drainage/utility/perimeter features may constrain geometry without entering
  the FAA chart selection.

## FAA-IAC profile contract tests

Use small hand-authored airport models so each test isolates one rule.

### Lifecycle portrayal matrix

Cover at minimum:

- active hard-surface runway;
- active aggregate-turf or turf surface where supported;
- indefinitely closed runway;
- permanently closed runway with operational data removed;
- physical pavement remaining after runway removal;
- runway under construction;
- new runway under construction;
- repurposed former runway;
- partially removed or closed segment;
- temporary versus final marking state.

Assert selected symbol, fill/screen, X pattern, inclusion/exclusion of designators and
runway data, and required notes. Do not set those states through renderer flags.

### Content selection

- current FAA Airport Diagram excludes default highest-obstacle and ILS localizer/glide-
  slope NAVAID depiction unless explicitly justified by profile scope;
- an optional generic obstruction remains selectable for sourced safety content;
- wind indicators, beacons/towers, runway visual aids, and lighting notes are selected
  from typed assets/facts;
- construction-only details such as asphalt mix type, underground cable, or drainage-pipe
  material do not appear by default;
- asphalt, concrete, and fuel-resistant hard surfaces share the FAA pavement portrayal
  unless another profile overrides it.

### Page and text grammar

- top-left Julian revision date and `AIRPORT DIAGRAM`;
- one top `AL-nnn (FAA)` reference;
- top-right and bottom-right airport identity arrangements;
- bottom-left repeated title/date;
- both rotated side-margin volume/date strings;
- correct inside-neatline rotation for the landscape convention while outer margin text
  remains page-readable;
- boxed-item whitelist and plain-label classes;
- explicit profile decision for `HS 1` versus `HS1` spelling;
- required caution and readback lines.

## Renderer structure tests

Prefer parsed XML or a project-owned render tree over free-form regex where practical.
Require:

- one SVG root with finite view box and no NaN/infinite coordinates;
- stable semantic groups for graticule, surfaces, runways, buildings, markings, labels,
  hotspots, furniture, and margins;
- layer ordering consistent with the chart profile;
- colors and line weights drawn only from profile tokens;
- unique element IDs and escaped text;
- correct rotations and transforms for runway-end text and landscape inner content;
- every required chart-document item serialized exactly once unless repetition is part of
  the margin grammar;
- every label candidate either placed or reported as unresolved; no silent omission;
- no renderer mutation of the source airport or chart document.

## Label and layout tests

Test the layout engine before SVG serialization:

- placed label rectangles do not overlap equal/higher-priority labels beyond declared
  tolerances;
- labels avoid required geometry exclusion regions or use a halo/leader allowed by class;
- leader endpoints refer to the intended object and do not terminate inside unrelated
  labels;
- runway/taxiway/facility/hotspot priority is enforced without dropping required lower-
  priority content;
- dense fixtures either find a valid placement/inset or emit a deterministic diagnostic;
- field and furniture placement remain within the selected neatline and margin zones.

Use browser/raster bounding-box measurement as an integration check, not the only source
of layout truth.

## Population and property tests

Run a small corpus on every test invocation and a larger deterministic corpus in the
slower/CI tier.

Suggested starting sizes:

- fast: 25 seeds per role plus the curated fixtures;
- full: 250 seeds per role;
- stress/nightly/manual: 1,000+ mixed seeds, retained failures minimized to fixtures.

Population assertions:

- zero non-finite/invalid geometry and zero unexplained solver fallbacks;
- zero protected-area, building, stand, or incompatible-surface violations;
- required graph reachability holds;
- lifecycle combinations remain valid;
- distribution includes expected runway families, site regimes, terminal families,
  terminal counts, phase types, apron collectors, and contextual constraints;
- no identity, heading, terminal-side, or morphology mode collapse;
- large roles trend toward greater capacity/complexity without requiring every individual
  seed to be monotonically larger;
- failure messages record seed, options, subsystem, and failed constraint for promotion
  into the fixture set.

Do not assert visual realism through a single scalar such as polygon vertex count.

## Reference-corpus tests

The checked-in FAA SVGs are exported artifacts, not project-owned markup. Analyze them
with a tolerant feature extractor and keep assertions narrow:

- recognized FAA palette families and line-weight clusters;
- presence and arrangement of margin/title families where extractable;
- screened pavement versus black buildings/runways;
- graticule and hotspot conventions;
- descriptive terminal/apron metrics used for diagnostics.

If an SVG cannot be semantically parsed because text is outlined or styles are indirect,
record the limitation instead of weakening generated-output tests or rewriting the
reference file.

The wider international corpus informs object inventory and morphology but must not be
made to pass the FAA-IAC profile suite.

## Visual regression and review

### Automated raster comparison

Add only after the chart renderer and fonts are stable:

- pin SVG rasterizer, font files, viewport, scale, antialiasing environment, and color
  profile;
- store baselines only for the curated fixture manifest;
- use a small pixel threshold plus a perceptual/structural diagnostic;
- emit current, expected, diff, and metadata artifacts on failure;
- require explicit baseline approval in a focused change;
- never update all baselines merely to make CI green.

Visual regression detects change, not correctness. A reviewed but wrong baseline remains
wrong.

### Contact-sheet review

For each major phase render a standard sheet containing:

- one fixture per role;
- all applicable terminal families;
- at least one sparse and one dense page;
- the full runway-lifecycle matrix;
- selected generated/reference pairs at comparable airport roles.

Review in this order:

1. page scale, rotation, margins, and whitespace;
2. runway/taxiway topology and surface continuity;
3. terminal hierarchy, silhouettes, road courts, apron bands, taxilanes, and throats;
4. district differentiation and contextual constraints;
5. annotation density, label collisions, and leader clarity;
6. IAC symbols, lifecycle states, palette, and line discipline.

Record newly discovered normative rules in `spec.md`; record implementation defects as
tests and plan items. Do not expand the audit documents into competing backlogs.

## Build and merge gates

For every implementation slice:

- `bun test` passes the fast suite;
- `bun run build` passes type checking and production build;
- changed fixture summaries are reviewed and explained;
- affected visual fixtures are rendered and inspected;
- no new undocumented fallback, skipped assertion, or broad threshold increase is added;
- code, tests, and any necessary `spec.md` clarification land together.

Before declaring the next code pass complete, run the full population, reference-corpus,
renderer, export smoke, and visual-review tiers from a clean checkout.
