# Test-suite specification (revision 2)

## Purpose

The suite must prove four things without confusing them:

1. the generated airport is semantically coherent (model layer);
2. its geometry is valid and respects constraints (geometry layer);
3. the rendered sheet follows the IAC-9 conventions (renderer layer);
4. the population stays valid and varied across many seeds (population layer).

There is no publication-selection layer: the renderer targets FAA IAC-9 only
(`edit-plan.md` "Decisions and cuts"), so IAC conformance is tested at the renderer
layer directly.

## Principles

- Test the earliest authoritative representation: a lifecycle rule belongs in a model
  test and a portrayal test, not only in an SVG regex.
- Do not trust renderer self-reporting alone (`data-label-overlaps="0"` is a debug
  hook, not proof); keep it as a regression tripwire, verify layout separately where
  it matters.
- Same-version determinism is exact; reviewed expectations change when the contract
  intentionally changes. Do not freeze SVG bytes outside serialization tests.
- Prefer invariants over golden output for population tests.
- Use real diagrams to learn conventions; never require synthetic airports to
  reproduce specific real layouts.
- Every bug fix adds the smallest seed or fixture that would have caught it.
- **Contract tests for unimplemented target behavior are recorded as `test.todo`** in
  the suite that will own them, so the suite stays green while the contract is
  visible. Flipping a todo to a live test is part of the phase that implements it.

## Organization

```text
test/
  fixtures/
    seeds.ts               curated fixture manifest with semantic summaries
  helpers/
    geometry.ts            predicates shared by suites (import engine exports where they exist)
    svg.ts                 SVG text/structure inspection
    model.ts               semantic summaries over SiteModel
  determinism.test.ts      seed → model/SVG equality, stream isolation
  model.test.ts            runway/taxiway/apron/building invariants
  terminal.test.ts         hierarchy + apron structure (mostly todo until Phase 3)
  chart.test.ts            margins, palette, line weights, labels, lifecycle portrayal
  population.test.ts       multi-seed constraint + diversity sweeps
  reference.test.ts        conventions measured from the real-airport corpus
```

Flat layout, one file per concern; Bun discovery needs no directories.

## Fixture manifest

`test/fixtures/seeds.ts` exports one typed list; no magic seed strings in suites. Each
fixture declares seed, options, why it exists, and a reviewed semantic summary (role,
runway count/families, archetype, notable states). Minimum coverage:

| Family | Cases |
|---|---|
| Role | one fixture per role (6) |
| Archetype | one per retained family + `none` |
| Runways | single-runway GA, parallel bank, mixed-family crossing, closed/legacy runway present |
| Page | predominantly east-west field (rotated sheet), dense hub sheet, sparse GA sheet |

Fixtures freeze the semantic summary, not the JSON or the SVG.

## Current-test migration

| Current assertion | Action |
|---|---|
| same seed → equal model and SVG in one run | Keep; add stream-isolation checks when streams are added. |
| every open runway has a full-length parallel | Keep as-is for now (the generator always emits one); the spec contract (relaxed for basic visual GA) is recorded as todo alongside it. |
| hotspots ≥500 ft apart | Replace with unique IDs + hazard-linked placement. No invented separation minimum. |
| `AL-nnn (FAA)` appears ≥2 times | Keep temporarily; todo: exactly once, top margin (flips in Phase 1). |
| open runway black / `closed` white+X | Keep temporarily; todo: full lifecycle portrayal matrix (Phase 1). |
| exact palette set equality | Keep — it is the ink-discipline contract. New ink requires a deliberate edit here. |
| `data-label-overlaps="0"` across roles | Keep as tripwire. |
| reference tests read `reference/real-diagrams/*.svg` | Migrate to `reference/real-airports/manifest.json`; skip-with-notice entries missing on disk (manifest lists 73, disk has 71); apply FAA ink/weight conventions to FAA-publisher entries only. |

## Layer contents

**Determinism** — same (version, seed, options) → deep-equal model, byte-identical
SVG; cross-role determinism; identity/wind diversity floors over a seed sweep.

**Model invariants** — reciprocal headings differ by 180°; designators match magnetic
heading; field elevation = max runway-end elevation; parallel separations in standard
families; RPZ full-polygon containment (edges, not just vertices — strengthen the
current vertex-only check); buildings clear RPZs and runway corridors; taxiway naming
grammar (no I/O/X, connector numbering, repair links unlabeled); network is one
connected component touching every runway and apron.

**Terminal** (Phase 3 contracts, todo until then) — hierarchy from typed records;
every component has a parent; gate faces carry apron bands; landside courts are never
apron; every throat traces to a collector; every stand reaches a named taxiway;
accretion operations recorded. Live today: non-`none` archetypes produce a terminal
apron; apron polygons are simple/finite; every apron-throat taxiway touches its apron.

**Chart conventions** — margin grammar (todo: corrected topology per Phase 1); valid
Julian date; palette and two-weight line discipline; graticule presence and labels;
boxed-items whitelist; hotspot layering above black ink; lifecycle portrayal matrix
(todo); taxiway-label orientation along path tangent (todo).

**Population** — fast tier on every run (~25 seeds/role), full tier behind an env
flag (~250 seeds/role): zero invalid geometry, zero constraint violations, diversity
floors on identity/heading/archetype/district sets, no mode collapse. Failure messages
record seed + options + failed constraint for promotion to a fixture.

**Reference corpus** — treat checked-in real SVGs as measurements, not project markup:
FAA entries match the ink palette family and two-weight clustering; all entries parse
and are non-trivially sized. If a file cannot be semantically parsed, record the
limitation; never weaken generated-output tests to match.

## Visual review

Automated raster regression is deferred until the Phase 3 renderer output settles.
Until then: per-phase contact sheets (one fixture per role + per family, sparse and
dense pages, lifecycle cases) reviewed against the FAA reference set in this order:
page composition → runway/taxiway topology → terminal/apron structure → annotation
density → symbols and line discipline. New normative rulings go to `spec.md`; defects
become fixtures.

## Merge gates

Per slice: fast suite green; `bun run build` clean; changed fixture summaries reviewed
and explained; affected contact sheets rendered and inspected; no new skipped
assertion or threshold loosening without a recorded reason. Before declaring the pass
complete: full population tier, reference tier, and export smoke from a clean clone.
