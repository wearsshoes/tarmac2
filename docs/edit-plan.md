# Edit plan for the next code pass (revision 2)

## Purpose

Dependency- and leverage-ordered implementation plan for the next code pass. This
revision supersedes the previous edit-plan draft, which specified a publisher-profile
architecture, a six-axis surface model, and modeled-but-invisible causal systems that
are out of proportion to a ~3,000-line engine and a single-sheet art goal.

The success criterion is unchanged (`spec.md`): one generated sheet reads as real to
someone who knows FAA airport diagrams. Every phase below is justified by that
criterion, using the audit consensus (`rendering-discrepancies.md` §10 leverage order,
`iac9-improvement-scope.md` P0–P1) rather than by model completeness.

## Decisions and cuts (recorded)

These are deliberate scope decisions, not omissions. Revisit only if the product goal
changes.

1. **One publisher target: FAA IAC-9 (6 May 2025).** No publisher-neutral model, no
   profile framework, no `ChartDocument` layer. The principle survives as renderer
   discipline: the renderer maps model facts to portrayal; a visual style is never the
   source of operational truth, and no generator field exists only to select a drawing
   style. The non-FAA reference corpus remains morphology evidence only.
2. **Minimal lifecycle model, not the six-axis decomposition.** Replace
   `Runway.closed?: boolean` with a `lifecycle` enum covering the six IAC states
   (active, indefinitely closed, permanently closed, closed-with-pavement-visible,
   under construction, new-under-construction, repurposed). Material
   (asphalt/concrete/etc.) and independent marking-state axes are cut: they produce
   identical pixels under FAA portrayal. Segment-level partial states are deferred
   until a fixture actually needs one.
3. **Terminal rebuild keeps the pipeline inversion, cuts the planning consultancy.**
   Keep: terminal/concourse hierarchy with stable IDs, edge roles on building faces,
   stands and taxilanes generated *before* the apron polygon (the boundary is derived
   from operations, not a bounding rectangle with steps). Two causes are promoted to
   real drivers because they are directly visible: **road courts** for unit/
   curvilinear systems (special-case loop/spine geometry that spaces the units) and
   **landside envelope numbers** (curb/parking depth bounding processor size and unit
   spacing). Cut: generated landside road networks (a reserved non-apron **landside
   court** polygon does that job elsewhere), drainage/utility/fence/emergency systems,
   multi-criterion site scoring (simple placement rules suffice), demand simulation as
   master input, and the remote/transporter family. Phased growth is reduced to a
   short vocabulary of 2–4 accretion operations with recorded causes, with a recorded
   contingency to demand-sequence them if hub contact sheets read too tidy. This is
   the "bounding level 2.5" ruling detailed in `terminal-generator-plan.md`.
4. **No polygon-boolean geometry foundation.** FAA pavement is one flat #CFCFCF with
   no outlines, so overlapping ribbons + fillet patches are visually identical to a
   union. The existing ribbon/fillet approach stays; invest in *topology* (what
   connects to what, where) rather than boolean area algebra.
5. **Deferred until a concrete fixture demands them:** congested-area insets and
   multi-panel pages, NAVAID located symbols, obstacle depiction (removed from the
   FAA product by the 6 May 2025 change — a consensus *non-goal*), declared-distance
   tables (the boxed negative-`D` indicator is in scope; the table is not on the
   diagram), international publisher features, and any modeled system whose only
   consumer would be an unbuilt renderer feature.
6. **Determinism contract:** same version + seed + options → same output. RNG streams
   are already forked per subsystem via `derive(label)`; extend stream isolation where
   new subsystems are added (terminal program vs. silhouette detail). Current SVG
   bytes and draw order are not a permanent contract.

## Current defects this plan must clear

From the code audit (kept here so the audits stay diagnosis, not backlog):

- `test/reference.test.ts` reads `reference/real-diagrams/*.svg`, deleted in commit
  `3724773`; 4 of 27 tests fail on ENOENT. The corpus manifest lists 73 SVGs but 71
  are on disk (`FAOR.svg`, `FALE.svg` absent).
- `closed` flag renders an illegal hybrid portrayal (permanently-closed outline +
  removed-pavement X's).
- Margin topology: `AL-nnn (FAA)` repeated at bottom (top-only per IAC), bottom-left/
  bottom-right groups swapped, random 5-digit `chartNumber` can yield an invalid
  Julian date.
- Taxiway identifiers set page-horizontal instead of along the path tangent.
- Every tower gets a beacon star + `TWR/BCN`; collocation must be a source fact.
- Displaced thresholds drawn with paint-grammar chevrons, not the Appendix-1 symbol.
- `FIELD ELEV` box lacks its dot + leader to the runway high point.
- Dead/vestigial code: `Segment` type, `HoldLine.taxiwayName` always `""`,
  `Hotspot.reason` generated but unused, `rng.fork` alias, several unused geometry
  helpers; repair taxiways named `Z1–Z9` with `unlabeled: false` contradicting the
  type comment.
- No test asserts terminal/apron/archetype structure at all.

## Phase sequence

| Phase | Outcome | Depends on |
|---|---|---|
| 0 | Test baseline: fixture manifest, split suites, corrected assertions, reference-test migration | — |
| 1 | IAC sheet correctness: margins, lifecycle states, label orientation, symbol fixes | 0 |
| 2 | Airfield topology density: threshold clusters, connector variety, repair-route quality | 0 |
| 3 | Terminal & apron rebuild (trimmed program-first) | 1–2 |
| 4 | Role-gated located features and furniture families | 1–3 |
| 5 | Calibration, variety, composition, app polish | 0–4 |

Phases 1 and 2 are independent and may interleave. Phase 3 is the showpiece and gets
the most iteration time. Typography/halo tuning is deliberately last (Phase 5): the
audits agree the perceptual gap is topology and detail, not type.

## Phase 0 — Test baseline (no engine changes)

### Scope

- Create `test/fixtures/seeds.ts`: a typed manifest of curated seeds covering roles ×
  archetypes × notable states, each with a reviewed semantic summary (role, runway
  family/count, archetype, closed-runway presence). Stop scattering magic seeds.
- Add `test/helpers/` (geometry predicates, SVG inspection, model summaries) so suites
  stop reimplementing `pointInPolygon` and friends; import from `src/engine/geometry`
  where an export exists.
- Split `test/engine.test.ts` by concern: determinism, runway/taxiway model
  invariants, chart conventions. Failures should identify the layer.
- Migrate `test/reference.test.ts` to `reference/real-airports/manifest.json`: iterate
  manifest entries, skip-with-notice files absent on disk, and apply FAA ink/stroke
  conventions **only to FAA-publisher entries**. Non-FAA entries get corpus-presence
  checks only.
- Correct assertions that encode obsolete or wrong contracts, and record the target
  contract as `test.todo` so the suite stays green until the phase that implements it:
  - `AL-nnn (FAA)` twice → todo: exactly once, top margin (Phase 1);
  - every open runway has a full-length parallel → keep for instrument runways, relax
    for basic visual GA per spec A3 (current generator always emits one, so the
    stricter form still passes; the relaxed form is the contract);
  - hotspot 500-ft minimum spacing → replace with unique-ID + hazard-linkage checks;
  - closed runway = white fill + X's → todo: lifecycle portrayal matrix (Phase 1);
  - add todo contracts for terminal hierarchy/apron structure (Phase 3).
- Add the missing structural coverage that is already true today and cheap to assert:
  every apron polygon is simple/finite/CCW-or-CW-consistent, terminal aprons exist for
  non-`none` archetypes, every apron-throat taxiway touches its apron.

### Exit criteria

- `bun test` passes deterministically from a clean clone; failures name their layer.
- Every later phase has named fixtures and a recorded (possibly todo) contract test.

## Phase 1 — IAC sheet correctness

Small, cheap, and every sheet benefits. All items are P0-class in
`iac9-improvement-scope.md`.

### Scope

- **Margins:** derive the Julian revision date from the identity cycle (always valid),
  `AL-nnn (FAA)` top margin only, bottom-left = repeated title + date, bottom-right =
  city/state above name + `(ID)`, per `real-diagram-features.md` §1.
- **Lifecycle:** replace `closed?: boolean` with the `lifecycle` enum; implement the
  IAC portrayal per state (open outline + one X per end and no data for permanently
  closed; screened pavement + repeated X's for removed-but-visible; dotted outline for
  new-under-construction; etc.). Legacy fields draw at most one non-active runway.
- **Labels:** taxiway identifiers set along the path tangent (fold to ±90° for
  readability); enforce identifier grammar (no spaces/dashes; repair links unlabeled).
- **Symbols:** displaced threshold per Appendix 1; tower/beacon as independent facts
  with `TWR/BCN` only on explicit collocation; `FIELD ELEV` dot + leader to the known
  runway high point; keep `HS 1` spelling (recorded IAC ambiguity ruling).
- Remove dead code touched along the way (`Segment`, `fork`, unused helpers,
  `HoldLine.taxiwayName` — populate it or drop it).

### Exit criteria

- Margin-grammar, lifecycle-matrix, and label-orientation contract tests flip from
  todo to passing. Palette/weight discipline tests still pass.

## Phase 2 — Airfield topology density

The single largest perceptual gap (`rendering-discrepancies.md` priority 1): real
fields read as one connected organism with dense, purposeful threshold areas.

### Scope

- **Threshold clusters:** at busy runway ends, generate the recognizable cluster —
  parallel jog with reverse curves, holding bay slots or bypass stub, angled entrance,
  ILS/CAT 2 hold placement tied to actual routes. GA ends get simple turnarounds.
- **Connector variety:** break the even connector cadence (cluster near ends, sparser
  midfield), vary high-speed-exit presence/direction by landing flow, add an
  occasional crossover between dual parallels.
- **Repair quality:** connectivity repair must route along plausible corridors (no
  straight diagonal chords across the field, none through RPZs); repair links are
  unlabeled service stubs, not lettered taxiways.
- **Junction geometry:** larger fillets and flared throats at runway junctions, sized
  by TDG; delete connector segments that cross runways they do not serve.
- **Variety:** widen the menu of parallel separations/staggers actually drawn from the
  standard families; vary which districts exist per seed so the same set does not
  recur at every airport.

### Exit criteria

- Connectivity holds with zero straight-chord repairs across protected areas.
- Threshold-area fixtures visibly match the reference cluster pattern on the contact
  sheet; population tests show separation/stagger and district-set diversity.

## Phase 3 — Terminal and apron rebuild

Implement the trimmed program-first pipeline. `terminal-generator-plan.md` (revision 2)
is the detailed reference; its stage list matches the cuts recorded above.

### Scope (summary)

1. **Hierarchy and program:** typed terminal → concourse/satellite components with
   parent IDs and stable identity; gate-count ranges by role; archetype chosen from
   program + site frame with role supplying priors, not the whole answer.
2. **Edge roles and landside:** every exposed building face classified (gate-face,
   landside-curb, connector, expansion-end, service); the landside court is a reserved
   non-apron polygon; landside envelope numbers bound processor depth and unit
   spacing; unit/curvilinear families get explicit road-court geometry.
3. **Operations before outline:** stands on gate faces → taxilanes/alleys →
   collectors → flared throats onto named taxiways; the apron polygon is derived from
   those operations plus purposeful residuals. Delete `steppedEdge` and the
   bounding-rectangle apron once replacement fixtures pass — no hub fallback.
4. **Accretion:** 2–4 growth operations (lengthen an end, add/cap a pier, detach a
   satellite with connector, infill a processor) with recorded causes, giving
   silhouettes their earned irregularity.
5. **Districts:** cargo/GA/RON/deice aprons get stand rows and taxilane access instead
   of labeled empty polygons; keep the existing placement machinery.

### Exit criteria

- Gate faces have apron bands; landside courts are non-apron; every throat traces to a
  collector; hierarchy is asserted from typed records, not polygon counts.
- The six retained families (linear, pier, satellite, midfield/parallel, unit,
  curvilinear) are visually distinguishable on the fixture contact sheet, and hybrids
  arise from accretion, not noise.

## Phase 4 — Located features and furniture families

Role-gated texture, highest-frequency first (six-doc consensus items):

- approach-light miniatures + circled letters and VGSI symbols on the correct side;
  REIL/lighting facts rendered as grouped boxed notes (`All Rwys` / exception grammar);
- boxed negative-`D` declared-distance indicator under the comm block;
- wind cone / segmented circle symbol; helipad circle-H where role justifies;
- deice pads generated (the schema-only `deice` apron kind) with leaders, hubs only;
- non-movement hatching + legend box on a minority of sheets;
- hotspot `reason` surfaced (structured hotspot note/table) instead of dropped;
- ramp-frequency table linked to actual named ramps.

Every item is justified by role and era (`spec.md` B6: sprinkle, never all at once).

### Exit criteria

- Each family is backed by typed model data, appears at plausible per-role frequency
  across the population, and never all at once on one sheet.

## Phase 5 — Calibration, variety, composition, app

- Contact sheets per role/archetype against reference charts; population diversity
  metrics (semantic: family distribution, terminal counts, district sets — not vertex
  counts).
- Composition: role-aware furniture density (sparse GA sheets get fewer, larger-scale
  furniture; hubs use insetless density management), graticule prominence tuning.
- Typography last: halo weight reduction, size hierarchy by label class.
- App: expose seed, role, region, archetype-where-valid; verify SVG/PNG export; remove
  debug attributes from exported output (keep `data-*` hooks in test mode).
- Delete remaining dead code and stale doc statements; update `docs/README.md` status.

### Exit criteria

- Curated fixture set approved visually; full suite green from a clean clone;
  documentation matches shipped behavior.

## Review slices and commit boundaries

1. test baseline and reference-test migration (Phase 0);
2. margin/lifecycle/label/symbol corrections (Phase 1, may be 2–3 commits);
3. threshold clusters and connector variety; repair-route quality (Phase 2);
4. terminal hierarchy + program types with adapted current geometry;
5. edge roles, stands, taxilanes, derived apron for linear + pier;
6. remaining families, accretion, district aprons; legacy terminal code removal;
7. located-feature families (Phase 4, one commit per family group);
8. calibration, composition, app, cleanup (Phase 5).

Each slice lands with its tests and any `spec.md` clarification. Do not combine a
model migration with unreviewed visual retuning.

## Definition of done

The pass is complete when: the six IAC lifecycle states, correct margin grammar, and
tangent-aligned labels are implemented and tested; threshold areas and connector
topology read as purposeful; terminal aprons are derived from stands and taxilanes
with landside courts preserved and hierarchy asserted from typed records; role-gated
feature families appear at plausible frequencies; and the curated contact sheet
survives review against the FAA reference set.
