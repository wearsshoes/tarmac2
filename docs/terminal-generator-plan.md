# Revised terminal generator plan

## Objective

Replace the current shape-first terminal grammar with a program-first subsystem that
generates a terminal complex, its landside access, its aircraft stands and taxilanes, its
apron surfaces, and its connection to the airport as one coordinated solution.

The target is not architectural floor-plan simulation. It is a semantically explainable
top-down airport model whose black building silhouettes and gray pavement read like the
real FAA diagrams cataloged in `terminal-geometry-catalog.md`.

`terminal-design.md` is the descriptive source. `apron-and-paved-surface-design.md`
defines the observable pavement contract. This document defines implementation order and
interfaces for the next code pass.

## What is wrong with the current pipeline

`buildTerminal()` currently chooses an archetype from role, builds polygons from bars or
arcs, surrounds the maximum extents with one rectangular apron, and cuts repeated
fixed-width steps into its airside edge. The district builder then draws straight throat
stubs from those stations to a taxiway target.

That order causes the main audit discrepancies:

- terminal count is inferred from polygon/label count rather than a facility hierarchy;
- all buildings inside an archetype share one apron regardless of gate-bearing faces;
- landside edges and road courts are paved as aircraft apron;
- detached concourses float in an undifferentiated rectangle;
- internal taxilanes and stands do not exist, so throats have no traffic source;
- every throat has the same rectangular boundary grammar;
- site, road, drainage, utility, historic, and expansion constraints enter too late or
  not at all;
- irregularity is random local shape variation rather than the consequence of phases.

The current `steppedEdge()` function and one-polygon `terminal-apron` result should be
deleted once the replacement reaches fixture parity. They should not remain as a hub
fallback.

## Proposed data boundary

The precise TypeScript spelling can evolve, but the subsystem needs these conceptual
records.

### Inputs

- `TerminalProgram`
  - passenger/traffic role, hub/O&D balance, design aircraft mix, design-hour scale;
  - number of independently processed terminal units;
  - domestic/international/FIS need;
  - gate and remote-stand demand by aircraft class;
  - baggage, cargo/mail, service, maintenance, and RON needs;
  - required growth reserve and airport era.
- `TerminalSiteEnvelope`
  - buildable airside/landside region;
  - runway, taxiway, taxilane, RPZ/BRL, and object-clearance constraints;
  - access-road/transit approach and required landside court;
  - available taxiway attachment corridors;
  - drainage, utility, perimeter, shoreline, terrain, historic, and inherited-building
    constraints;
  - neighboring district interfaces and reserved expansion directions.
- `TerminalGenerationPolicy`
  - allowed morphology families for the program/site combination;
  - target density and phase count;
  - walking-distance/connection policy;
  - publisher-neutral feature detail level.
- independently derived RNG streams for program, composition, dimensions, phasing, and
  surface detail.

### Outputs

- stable terminal-system hierarchy: terminal units → processors → concourses/piers/
  satellites → gate faces → stands;
- building components and unioned display footprints, each with parent, function, phase,
  and frontage edge roles;
- connection semantics for bridge, tunnel/APM, elevated guideway, or at-grade corridor;
- landside network: approach road/spine/loop, curb frontage, parking/garage/transit
  reservations, and service access;
- aircraft-operation graph: stands, pushback paths, apron taxilanes, collectors, turning
  areas, and taxiway throats;
- surface regions for gate bands, alleys, collectors, RON/hardstand, deicing, service
  courts, roads, and residual phase pavement;
- growth reserves and phase history;
- constraint report containing the reason for every rejected or degraded solution.

The chart renderer may union components for visual output, but it must not destroy their
identity or relationships in the airport model.

## Generation pipeline

### Stage 1 — Derive the terminal program

Start from traffic role, site regime, airport era, and design codes. Derive ranges rather
than drawing an archetype directly:

- basic/business GA: no airline terminal unless commercial service is explicitly
  selected; generate an FBO/GA passenger building under the GA district grammar instead;
- regional: one processor, roughly 5–20 gates, mostly ADG III or smaller, with a linear
  or compact pier solution;
- mid-hub: one or two processors, roughly 20–60 gates, two or more operational zones,
  pier/hybrid/limited satellite solutions;
- major hub: one or more terminal units, roughly 50–140 gates, domestic/international
  processing, remote/RON demand, and pier, midfield, satellite, or unit-terminal systems;
- mega hub: several terminal-system entities, very high gate demand, explicit passenger
  connectors, multiple apron collectors, and phased expansion.

Gate numbers are sizing inputs, not necessarily rendered objects in the first slice.
Generate enough stand records to validate the footprint and taxilane capacity.

### Stage 2 — Count terminals correctly

Choose independently programmed passenger-processing units, then assign components:

- one processor with four detached concourses remains one terminal system;
- two processors with independent curbs may be two terminals even when their airside
  pavement merges;
- a combined public label such as `C/D` can refer to multiple concourse masses under one
  operating identity;
- a connector or preserved historic building is not automatically another terminal.

Names and labels are generated after this hierarchy, never used to infer it.

### Stage 3 — Establish the site frame

Find candidate terminal districts from runway/taxiway topology before placing buildings.
Score candidates by:

- taxi distance to intended runway banks and number of runway crossings;
- safe building and parked-aircraft clearances;
- ability to connect two or more apron collectors without full-width pavement bleed;
- landside access from the parcel edge without crossing the AOA;
- available processor/curb/parking depth;
- drainage, utility, fence, historic, water, terrain, and existing-facility constraints;
- at least one feasible growth direction;
- compatibility with cargo, GA, maintenance, and emergency access.

Return a local terminal frame with explicit airside and landside directions. Do not assume
that `+v` is airside for every component in a loop or multi-unit system; each terminal
unit needs its own frontage orientation.

### Stage 4 — Select a morphology family from constraints

Use a compatibility table rather than a role-only weighted list:

| Family | Required conditions | Strong disqualifiers |
|---|---|---|
| Linear | modest gate demand, long usable frontage, workable curb parallel to gate face | high gate demand with no extension room |
| Pier/comb | adequate apron depth, processor edge long enough for pier pitch, alleys can exit or turn | site too shallow for gate rows + taxilane |
| Detached compact satellite | need for compact remote gate mass and a feasible passenger connector | no connector route or surrounding apron clearance |
| Parallel midfield bars | wide runway/terminal district, strong connecting traffic, tunnel/APM access, end circulation | constrained shallow parcel or insufficient runway separation |
| Unit terminal | multiple processors, independent landside access, spine/loop road, enough separation between units | one narrow landside frontage or no road court |
| Curvilinear/unit arc | loop/spine organization and usable convex gate face | court cannot remain landside or arc has no practical apron exits |
| Remote/transporter | hardstand operating program and bus/mobile-lounge connection | program requires conventional contact-gate frontage |
| Accreted hybrid | inherited facilities or multiple phases | greenfield first phase with no reason for inherited mismatch |

Allow a family override only when it remains feasible for the selected program and site.
An invalid override should return a diagnostic or choose an explicitly documented nearest
valid solution, not squeeze geometry through clearances.

### Stage 5 — Build a component and flow graph

Create logical nodes before polygons:

- processor nodes sized by program and landside frontage;
- concourse/pier/satellite nodes carrying gate demand and connection type;
- gate-face edges with aircraft-class mix and single/double-loaded status;
- passenger links with maximum-walk or required APM/tunnel/bridge behavior;
- baggage/service links that may use separate routes;
- phase and expansion links describing which ends may grow.

Validate graph invariants:

- every gate belongs to a gate face, component, and terminal unit;
- every gate has a passenger path to a processor;
- every gate has a service and aircraft path;
- a detached component declares how passengers reach it even if the connector is
  underground and therefore invisible in plan;
- no terminal component is orphaned merely because it is unlabeled on the chart.

### Stage 6 — Solve component geometry

Lay out the graph with dimensions from `terminal-design.md`:

- gate pitch from aircraft class and clearance;
- concourse width from double/single loading and program;
- pier spacing from opposing gate envelopes plus the required taxilane(s);
- processor size from frontage and processing scale;
- satellite dimensions from gate perimeter and connector landing point;
- arc radius/depth from the road court and usable convex gate frontage.

Use long construction-aligned segments and a small vocabulary of meaningful additions:
width steps at phase joints, infill blocks, rotundas, hammerheads, pods, splayed arms, and
blunt extension ends. Each addition records a reason and phase.

Do not union building polygons until after edge roles are assigned. Unioning too early
erases which faces accept gates, roads, service access, or future growth.

### Stage 7 — Assign edge roles and gates

Classify every exposed building edge:

- `gate-face` with aircraft class and stand orientation;
- `landside-curb`;
- `service` or baggage/GSE access;
- `connector`/bridge interface;
- `expansion-end`;
- `inactive/internal` after component union;
- `restricted` where an obstacle, road, or site constraint prevents stands.

Place stand modules on gate faces. Resolve corners, concourse roots, tips, bridges, and
mixed-aircraft transitions explicitly. If the requested gate count does not fit, lengthen
a permitted expansion edge, add a feasible component, reduce demand within the program
tolerance, or reject the candidate. Never silently overlap stand envelopes.

### Stage 8 — Generate apron operations before the outer polygon

For every stand or hardstand:

- create its aircraft envelope and pushback/lead path;
- connect it to a shared or paired taxilane;
- add head- or tail-of-stand service roads where the program requires them;
- widen concourse tips and dead ends for turning, bypass, or controlled end conditions;
- combine alleys into one or more collectors;
- connect collectors to feasible named taxiways through flared throats.

Derive surface regions as the union/offset of those operations plus purposeful residual
areas. Subtract landside courts, roads where the chart profile treats them separately,
buildings, unpaved islands, drainage/utility reservations, and no-taxi areas.

This reverses the current pipeline: taxilane paths determine throat stations and the
apron boundary; throat stations do not manufacture rectangular edge steps.

### Stage 9 — Generate the landside system

The landside network is required even if most of it is suppressed in the FAA chart:

- linear terminals receive a curb road parallel or gently curved along the processor;
- unit/curvilinear terminals receive a spine or loop with an intentional court;
- parking/garage/transit reservations occupy the landside side and constrain building
  depth and expansion;
- every processor has a public-access path and every service function has an appropriate
  controlled access path;
- roads, utilities, drainage, and emergency routes remain continuous through phases.

The landside result is the primary guard against wrapping gray aircraft apron around the
wrong building face.

### Stage 10 — Apply phased growth

Generate a coherent initial terminal, then apply a limited sequence chosen from:

- lengthen an approved end of a linear or midfield bar;
- thicken or infill a processor;
- lengthen, widen, or cap a pier;
- add another pier at valid pitch;
- add a detached satellite with a passenger connector;
- add another midfield bar and extend its APM/tunnel relation;
- add an independently accessed unit terminal;
- repurpose old gate apron as RON/remote/maintenance space;
- close/remove a component while retaining some pavement or connector evidence.

Each phase revalidates passenger, aircraft, service, emergency, landside, and utility
paths. Keep phase seams and asymmetry only where the operation explains them.

### Stage 11 — Integrate neighboring districts

The terminal solution reserves interfaces rather than generating in isolation:

- cargo gets truck frontage, deep aircraft stands, and one or more end/collector exits;
- GA gets FBO/transient parking plus hangar-facing taxilanes;
- maintenance gets door-aligned tow courts and service access;
- RON/overflow gets stand rows and taxilane access, not a label on an empty polygon;
- deicing pads sit on departure routes and carry collection/treatment relationships;
- fire stations get response courts and direct emergency routes;
- fuel/service/catering/utility areas remain reachable without crossing passenger curbs
  or severing aircraft routes.

District pavement may join the terminal system physically while retaining distinct
function, control, material, and phase records.

## Geometry and fallback rules

- All polygons must be simple, finite, correctly wound, and above minimum area.
- All aircraft routes must meet the appropriate width/clearance envelope.
- Acute residual slivers below a useful island or pavement width must be merged or
  removed with a recorded reason.
- Dead-end aircraft alleys need a valid turning/bypass/restriction outcome.
- A candidate may degrade within declared tolerances—for example, fewer stands or one
  fewer phase—but may not violate runway/RPZ/BRL/taxilane clearances.
- If no candidate satisfies the program, return a diagnostic and retry with a new
  deterministic site/morphology candidate. Do not use an unsafe first candidate.

## Determinism and variation

Use independent streams for:

- program sizing;
- terminal count and hierarchy;
- site candidate ordering;
- morphology family;
- component dimensions;
- gate distribution;
- phase history;
- small silhouette detail;
- surface and stand detail.

Variation should be measured at the semantic level: terminal counts, family distribution,
component graph shapes, gate counts, phase types, road organization, and apron collector
topology. A set of randomly perturbed rectangles is not meaningful diversity.

## Implementation slices

1. Add terminal hierarchy/program types and generate semantic programs while adapting
   current polygons.
2. Add site envelopes and terminal-site scoring.
3. Build component/flow graphs for linear and pier families.
4. Add edge roles, stand modules, and capacity validation.
5. Build apron taxilanes/collectors/throats and replace the rectangular apron for linear
   and pier fixtures.
6. Add landside curb/spine/loop constraints.
7. Add satellite and parallel-midfield families with connector semantics.
8. Add unit/curvilinear and remote/transporter families.
9. Add phased growth and accreted hybrids.
10. Integrate cargo, GA, maintenance, RON, deicing, fire, and site-service corridors.
11. Remove legacy terminal/apron generation and compatibility fields.

Every slice includes the relevant unit, invariant, population, and visual fixtures from
`test-suite-spec.md`.

## Acceptance contract

| Concern | Required observable result |
|---|---|
| Identity | Terminal, concourse, pier/satellite, and gate relationships do not depend on polygon count or labels. |
| Site | Buildings, stands, aprons, roads, and growth reserves fit the site and protected-area constraints. |
| Airside/landside | Gate faces touch appropriate apron bands; curb faces touch landside space; road courts remain non-apron. |
| Circulation | Every stand reaches a taxilane, collector, throat, and taxiway; every processor has passenger and public-access paths. |
| Detached components | Every satellite has a declared tunnel/bridge/APM/at-grade relation whether or not it is visibly drawn. |
| Apron shape | Boundaries follow edge roles, routes, turning areas, phases, and site constraints—not the maximum building bounding box. |
| Throats | Every throat comes from a collector and narrows/flares plausibly into the taxiway network. |
| Growth | Irregularity can be traced to a phase, inherited feature, route, road, drainage/utility corridor, or operational envelope. |
| Family fidelity | Linear, pier, satellite, midfield, unit, curvilinear, remote, and accreted systems remain recognizably different. |
| Variety | A curated population shows different valid graphs and phases without losing role/site plausibility. |
| Chart portrayal | The FAA renderer may simplify internal detail, but the visible black/gray silhouette preserves the semantic relationships above. |

The terminal rewrite is complete only when the airport model can explain the geometry
without reading the SVG and the SVG still communicates the same explanation at FAA chart
scale.
