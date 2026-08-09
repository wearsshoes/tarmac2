# Terminal generator plan (revision 2.5)

## Objective

Replace the current shape-first terminal grammar with a program-first subsystem that
generates the terminal hierarchy, its gate faces and stands, its apron taxilanes and
throats, and its derived apron surface as one coordinated solution.

The target is not architectural simulation. It is a top-down airport model whose black
building silhouettes and gray pavement read like the real FAA diagrams cataloged in
`terminal-geometry-catalog.md`, and whose geometry the model can explain.

`terminal-design.md` is the descriptive source (taxonomy, dimensions, growth).
`apron-and-paved-surface-design.md` defines the observable pavement contract. This
document defines the implementation decomposition for `edit-plan.md` Phase 3.

## Bounding level and scope cuts (this revision)

The chosen bounding level ("2.5"): geometry causes are **sampled, then recorded** —
except for the few causes with directly visible geometric consequences, which are
promoted to actual drivers:

1. **Road courts for unit and curvilinear systems.** These families get an explicit
   court: a loop/spine reservation that positions and spaces the terminal units, drawn
   or left as shaped negative space. This is special-case geometry, not a road
   network — it is what JFK/DFW-style layouts derive their look from.
2. **Landside envelope as a sizing constraint.** Curb length and parking/garage depth
   are numbers that bound processor depth and unit spacing. Nothing extra is drawn;
   proportions change.
3. **Contingent (decide at contact-sheet review):** if hub sheets still read too tidy,
   upgrade random accretion to **demand-sequenced accretion** — a short era trajectory
   (gate demand at 3–4 timestamps) selects the operations, so a grown-looking hub is
   grown everywhere. Do not build this pre-emptively.

Cuts, recorded in `edit-plan.md` "Decisions and cuts" and repeated here because this
file is the detailed reference:

- **No generated landside road network.** Each terminal unit reserves a **landside
  court** polygon (curb/parking side, oriented by the site's landside approach
  direction) that is never aircraft apron; unit/curvilinear courts above are the only
  road-shaped geometry.
- **No demand simulation as master input.** Gate programs are drawn from role ranges;
  the demand trajectory exists only if the accretion contingency above is exercised.
- **No drainage, utility, fence, or emergency-route modeling.**
- **No multi-criterion site scoring.** Terminal district placement keeps the existing
  quadrant/clearance machinery with two added rules: minimum taxi distance to the
  primary bank, and a landside side facing the parcel edge.
- **No remote/transporter family.** Retained families: linear, pier, satellite,
  parallel/midfield, unit, curvilinear — plus hybrids arising from accretion.
- **Phased growth is 2–4 accretion operations**, not a full phase-history system.
- **Connector type (bridge/tunnel/at-grade) remains a recorded draw**, not a
  walking-distance rule; revisit only if satellites look wrong.

## What is wrong with the current pipeline

`buildTerminal()` chooses an archetype from role, builds polygons from bars/arcs,
surrounds the maximum extents with one rectangular apron, and cuts repeated fixed-width
steps into its airside edge (`steppedEdge`). The district builder then draws straight
throat stubs from those stations to a taxiway.

Consequences (confirmed by the audits):

- terminal count is inferred from polygon/label count, not a facility hierarchy;
- landside edges and road courts are paved as aircraft apron;
- detached concourses float in an undifferentiated rectangle;
- internal taxilanes and stands do not exist, so throats have no traffic source;
- every throat has the same rectangular boundary grammar;
- irregularity is random local shape variation rather than the consequence of growth.

`steppedEdge()` and the one-polygon `terminal-apron` are deleted once replacement
fixtures pass. They do not remain as a hub fallback.

## Data boundary

Exact TypeScript spelling can evolve; the subsystem needs these records.

**Inputs**

- `TerminalProgram`: role-derived gate-count range and aircraft-class mix; number of
  independently processed terminal units; RON/remote-stand demand at hubs.
- `TerminalSiteFrame`: local (u, v) frame per terminal unit with explicit airside and
  landside directions; usable extent; taxiway attachment corridors; clearance limits.
- Independent RNG streams: program, hierarchy, morphology, dimensions, accretion,
  silhouette detail. A silhouette tweak must not change the gate program.

**Outputs**

- hierarchy: terminal units → components (processor, concourse, pier, satellite) with
  stable IDs and parent links; component connection type (attached, bridge, tunnel —
  tunnel connectors are simply not drawn);
- building polygons per component, each face classified by **edge role**: `gate-face`
  (with aircraft class), `landside-curb`, `connector`, `service`, `expansion-end`,
  `internal`;
- stands on gate faces (envelope + orientation), taxilanes/alleys serving them,
  collectors, and flared **throats** onto named taxiways;
- derived apron polygon(s): the union/offset of gate bands, taxilanes, and collectors
  plus purposeful residuals — minus the landside court and building footprints;
- landside court polygon per terminal unit;
- accretion record: which operations produced the final silhouette, in order.

## Generation pipeline

### 1. Program

From role: gate-count range (regional ≈ 5–20, mid-hub ≈ 20–60, major ≈ 50–140, mega
higher with multiple units), aircraft-class mix, terminal-unit count. GA roles produce
no airline terminal (FBO/GA grammar handles them). Gate counts are sizing inputs;
stands are generated to validate footprint and taxilane capacity, not necessarily all
rendered.

### 2. Hierarchy

Choose independently processed terminal units first, then assign components. One
processor with four detached concourses is one terminal; two processors with
independent curbs are two. Names/labels are generated after the hierarchy, never used
to infer it.

### 3. Site frame

Per terminal unit: a local frame with airside and landside directions derived from the
runway bank layout and parcel edge. Placement uses the existing district machinery plus
the two added rules above. Multi-unit systems (unit/horseshoe) get per-unit frames —
do not assume one global airside direction.

The frame carries the **landside envelope numbers** (curb length, parking/garage
depth) that bound processor depth and unit spacing in stage 5. For unit and
curvilinear families, generate the **road court** here: a loop/spine reservation whose
geometry positions the units and shapes the landside negative space.

### 4. Morphology family

Choose from the retained families using a compatibility check (program size vs.
frontage length vs. site depth), with role priors as tie-breakers. An override option
is honored only when feasible; otherwise return the nearest valid family with a
diagnostic.

**Midfield-only rule (recorded ruling):** the parallel/midfield family exists only
between two runway banks, bars parallel to the runways — the ATL grammar is what the
family *is*. A site whose bank gap cannot hold the midfield apron (or that has mixed
runway heading families) downgrades to pier; outboard parallel ranks are never drawn.

### 5. Component geometry and edge roles

Lay out components with dimensions from `terminal-design.md` (gate pitch by class,
concourse widths, pier pitch = opposing gate envelopes + taxilane, processor depth).
Classify every exposed face with an edge role **before** any union. Place stand
modules on gate faces; resolve corners, roots, and tips explicitly. If the program
does not fit, lengthen an `expansion-end`, add a feasible component, or shrink the
program within tolerance — never overlap stand envelopes.

### 6. Apron operations, then outline

For each stand: envelope + pushback path → shared taxilane/alley → collector →
flared throat onto a named taxiway. Derive the apron polygon from those operations.
Subtract the landside court and buildings. Dead-end alleys get turning space. This is
the pipeline inversion: routes determine throat stations and the apron boundary;
throat stations do not manufacture rectangular edge steps.

### 7. Accretion

Apply 2–4 operations drawn from: lengthen an approved end; thicken/infill the
processor; lengthen, widen, or cap a pier; add a pier at valid pitch; detach a
satellite with a connector; add a unit terminal. Each records its cause. Re-validate
stands and taxilanes after each operation. This is where earned irregularity and
hybrid families come from.

If contact-sheet review finds hub silhouettes too tidy, exercise the recorded
contingency: derive the operation sequence from a short era/demand trajectory instead
of independent draws (bounding level note above). The operation vocabulary is
unchanged either way.

### 8. Neighboring districts

Cargo, GA, RON, and deice aprons reuse the stand-row + taxilane vocabulary at reduced
fidelity: stand rows and access instead of labeled empty polygons. Deice pads sit on
departure routes (hubs only). Fire/fuel/military keep their existing grammar.

## Geometry and fallback rules

- All polygons simple, finite, consistently wound, above minimum area; slivers below a
  useful pavement width are merged or dropped with a recorded reason.
- A candidate may degrade within tolerance (fewer stands, one fewer accretion op) but
  may not violate runway/RPZ/taxilane clearances.
- If no candidate satisfies the program, retry with the next deterministic candidate
  and report which constraint failed. Never ship the first unsafe fallback.

## Implementation slices

1. Hierarchy/program types; generate semantic programs while adapting current polygons
   (no visual change).
2. Site frames with airside/landside directions, landside envelope numbers, and the
   landside court reservation.
3. Component graph + edge roles + stands for **linear and pier**; derived apron
   replaces the rectangular apron for those fixtures.
4. Satellite and midfield/parallel families.
5. Unit and curvilinear families **with road-court geometry**.
6. Accretion operations and hybrid fixtures (assess the demand-sequencing contingency
   at this slice's contact-sheet review).
7. District aprons (cargo/GA/RON/deice) on the stand-row vocabulary.
8. Delete `steppedEdge`, the bounding-rectangle apron, and compatibility fields.

Each slice lands with its fixtures and tests per `test-suite-spec.md`.

## Acceptance contract

| Concern | Required observable result |
|---|---|
| Identity | Terminal/concourse/gate relationships come from typed records, not polygon counts or labels. |
| Airside/landside | Gate faces touch apron bands; landside courts are never apron. |
| Circulation | Every stand reaches a taxilane, collector, throat, and named taxiway. |
| Detached components | Every satellite declares its connector type, drawn or not. |
| Apron shape | Boundaries follow edge roles and routes — never the building bounding box or repeated fixed-width steps. |
| Landside proportion | Processor depth and unit spacing respect the landside envelope numbers; unit/curvilinear courts read as designed negative space. |
| Accretion | Every irregularity traces to a recorded operation. |
| Family fidelity | The six families remain recognizably different on the contact sheet; hybrids arise from accretion. |

The rewrite is complete when the model can explain the silhouette without reading the
SVG, and the SVG still communicates that explanation at FAA chart scale.
