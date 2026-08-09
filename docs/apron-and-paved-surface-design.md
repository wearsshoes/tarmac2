# Terminal aprons and other non-runway paved surfaces

## Scope and central finding

This is a descriptive visual spec based on the 71 checked-in real-airport SVGs and the
36 current-engine audit renders. It covers paved operating surfaces other than the runway
proper: terminal aprons, gate stands, apron taxilanes, ramp throats, cargo and GA ramps,
remote parking, deicing and holding pads, hangar courts, service roads, and landside paved
circulation where it controls the airport silhouette.

The central discrepancy is structural. The engine treats an apron mainly as a filled
polygon belonging to a district. The real charts depict a **pavement system** assembled
from aircraft envelopes, taxilanes, service routes, building faces, safety clearances,
old and new construction, and the narrow connections between them. Real aprons therefore
have articulated boundaries and meaningful internal voids. Generated aprons are usually
rectangles or a single stepped slab, so they are too smooth, too empty, and too weakly
related to the buildings they serve.

This document describes the target appearance and relationships only. It does not propose
an implementation in this pass.

## 1. How apron pavement reads on a diagram

An apron is not simply “all gray area near a terminal.” It reads as four nested systems:

1. **Building-edge gate bands.** A strip follows each usable aircraft-facing concourse
   edge. Its depth is controlled by the parked aircraft, nose clearance, equipment area,
   and tail/service clearance.
2. **Apron taxilanes and alleys.** One or more routes collect aircraft from the gate bands.
   Their paths bend around concourse tips, pass between opposing gate rows, and merge near
   apron exits.
3. **Transition throats.** Broad flared connections join the apron taxilane system to
   named taxiways. A throat is a route junction, not a rectangular bite repeated along an
   otherwise straight boundary.
4. **Peripheral and residual pavement.** RON stands, maintenance pockets, hardstands,
   deicing areas, service courts, and old pavement fill selected notches or extend from
   the main operating system.

At FAA chart scale these may share one gray screen and have no outline. They remain
legible because of their topology: the gray follows black building faces, narrows into
taxiway ribbons, widens around aircraft operations, and leaves white or unpaved voids
where roads, islands, drainage, or landside courts occur.

## 2. Terminal apron morphology by terminal type

### 2.1 Linear terminal

- The primary apron is an elongated airside band following the gate face, not a rectangle
  centered on the entire building.
- The band usually continues a short distance beyond both terminal ends so end gates can
  maneuver. One end may flare more than the other where the taxilane exits.
- The landside curb/road face is excluded from the apron. A black terminal should not sit
  near the middle of a symmetric gray rectangle unless it genuinely has gates on both
  long faces.
- Small terminals often have one taxilane outside the gate row; larger linear terminals
  may have a through taxilane plus bypass or remote-stand pavement.
- Real examples such as KITH, YBCG, VIDN, EVLA, and many Finnish/South African regional
  fields show a shallow band with irregular end steps, not a full district slab.

**Characteristic outline:** long and narrow; one boundary echoes the terminal, the other
is a looser taxilane edge; ends are unequal flares or clipped corners.

### 2.2 Pier or comb terminal

- Each pier has gate bands down one or both sides. Opposing pier faces create a dead-end
  or through apron alley.
- The pavement between piers is sized by two parked-aircraft envelopes plus the shared
  taxilane system. It is operationally full, even when the chart shows only uninterrupted
  gray.
- Alley roots are broad and heavily merged into processor-front pavement. Alley ends may
  narrow, round, or contain a hammerhead/turning area.
- Pier tips create local bulbs, trapezoids, or clipped wedges so end gates and taxilanes
  can turn. A cap building should cause a matching change in gray pavement.
- The exterior edge of a multi-pier complex is ragged: it advances around long fingers,
  recedes beside short ones, and joins the taxiway network at a few concentrated exits.
- KCLT, KORD Terminals 2/3, KMIA, and the central KSEA complex show unequal alleys and
  accreted roots. A single apron rectangle erases the feature that makes the terminal read
  as a comb.

**Characteristic outline:** repeated deep slots around black fingers, wide merged root,
locally enlarged tips, and only partial alignment of the outer edges.

### 2.3 Parallel midfield concourses

- Each long bar needs gate bands and apron taxilanes on both long faces. The interval
  between adjacent bars is therefore an active circulation corridor, not generic empty
  ramp.
- A large system can read either as separate elongated apron bands joined at their ends or
  as one connected field whose internal organization is carried by multiple taxilanes,
  ramp names, hold positions, and service roads. It should not read as three black bars on
  one undifferentiated rectangle.
- End pavement extends beyond concourse tips to allow turning, bypassing, RON parking, or
  later extensions. The two ends are often different because one is the expansion end.
- Processor-to-first-concourse space has a different role from inter-concourse space: it
  may contain a bridge, tunnel alignment, service court, APM, or a transition from gate
  apron to taxiway.
- ATL and DEN are the governing FAA examples. The bars are orderly, but the gray fields
  contain distinct ramp/taxilane corridors and unequal end conditions.

**Characteristic outline:** several long parallel operational bands with broad end
connections; internal longitudinal routes dominate more than the outer bounding polygon.

### 2.4 Detached compact satellite

- A round, X, T, H, or irregular satellite gets pavement around every gate-bearing face.
  The apron behaves like a halo with a lobe at each arm, not a square bounding box.
- Concave corners between arms become aircraft alleys only if they have adequate depth;
  otherwise they are islands or service courts.
- A narrow surface connector may occupy one side. If the connection is underground, the
  satellite remains a visually detached black shape but its surrounding pavement still
  connects to the taxiway system.
- LAS D, the SEA satellites, and terminal satellites visible at several international
  airports demonstrate that the apron outline should echo the pod's radial or stepped
  outline.

**Characteristic outline:** offset halo around the building, with larger lobes at active
gate faces and one or more narrowed exits to taxilanes.

### 2.5 Unit and curvilinear terminals

- For a C, crescent, or horseshoe terminal, most airside pavement lies outside the convex
  arc and around its blunt ends. The concave landside court contains roads and parking and
  must remain a strong non-apron void.
- Gates can occupy selected inner or end faces, but that creates local pockets rather than
  permission to fill the whole court gray.
- Each unit normally has one or two local apron exits that merge with the common taxiway
  spine. Neighboring units may share outer taxilanes while retaining separate gate bands.
- DFW is the clearest correction to the current semicircle apron: its five units sit in
  deep road courts with pavement wrapping their outer rims. JFK, KLAX, and KSFO rotate
  dissimilar units around loop-road voids; their aprons face outward from the loop.

**Characteristic outline:** crescent or radial pavement outside the terminal, preserved
white/road court inside, and local wedges between neighboring units.

### 2.6 Accreted hybrid terminal

- Old and new apron phases rarely share one clean boundary. A newer pier can project into
  a former hardstand; an old apron can survive as RON space beside a new concourse; infill
  can turn a former throat into an internal taxilane.
- Surface boundaries change depth at building phase joints. Some edges align to taxilanes,
  while others follow roads, drainage, leaseholds, or obsolete pavement.
- Apron notches are purposeful. They may hold equipment, roads, small structures, or
  unpaved islands; they are not random decorative noise.
- BOS, ORD, MIA, JFK, LAX, and EFHK show the accumulated version of this grammar.

**Characteristic outline:** asymmetric union of several plausible bands and courts, with
visible phase seams expressed as steps, bends, or leftover pockets.

## 3. Dimensional stack visible behind the gray shape

The dimensional guidance in `terminal-design.md` explains why real apron bands have the
depth they do. Approximate building-face-to-apron-edge depths are:

| Gate environment | One taxilane | Two taxilanes |
|---|---:|---:|
| Narrowbody / ADG III | 340-380 ft | 480-520 ft |
| Widebody / ADG V | 560-620 ft | 800-860 ft |

Those values include the parked aircraft, clearance/service space, and taxilane system.
They are not a uniform offset to apply around every black polygon:

- **Gate-bearing face:** receives the full aircraft and taxilane stack.
- **Non-gate airside face:** may need only building/service clearance.
- **Landside face:** receives curb roads, sidewalks, and parking—not aircraft apron.
- **Pier alley:** depth is controlled jointly by both opposing gate rows.
- **Concourse tip:** receives extra maneuvering or end-gate depth.
- **Widebody or mixed-use face:** expands locally; it should not force the entire apron to
  widebody depth.

The visual rule is therefore a **semantic offset by edge role**, followed by merges and
local operational additions. A single bounding rectangle around the terminal maximum
extent will usually overpave the landside and underdescribe the airside.

## 4. Apron taxilanes and circulation

### 4.1 Shared versus independent routes

- A short dead-end alley may have one shared centerline between opposing gate rows.
- Long hub alleys and through routes commonly need paired/dual taxilanes so one aircraft
  can move while another pushes.
- The outer edge of a terminal apron often carries a through taxilane connecting several
  concourse alleys. This route is the apron equivalent of a collector street.
- Midfield bars commonly have continuous routes on both faces and cross-connections at
  one or both ends.

### 4.2 Merges and junctions

- Routes converge gradually. Broad fillets and islands distribute traffic before the
  apron meets a named taxiway.
- A terminal with four concourses does not need four independent straight stubs to the
  runway parallel. The real pattern is usually several alleys feeding one or two
  collectors, then a smaller number of apron exits.
- Junction geometry must leave meaningful islands or continuous pavement. Tiny acute
  slivers and hairline connections do not read as aircraft-capable.

### 4.3 Dead ends and turning space

- A dead-end pier alley ends in a widened pad, rounded bulb, offset escape route, or
  operationally restricted pocket.
- Long blind alleys often have bypass or secondary exits. A uniform rectangular end with
  no circulation explanation is uncommon at hub scale.
- The building tip, parked aircraft tails, and turning aircraft jointly determine the
  final shape.

## 5. Throats: how aprons meet taxiways

A real apron throat is recognizable by a change in pavement logic:

- It begins as one or more apron taxilanes, not as an arbitrary point on the outer
  polygon.
- It narrows toward taxiway design width while retaining broad fillets and safety
  clearances.
- It normally meets a collector or parallel taxiway at a legible junction.
- Multiple throat routes may be close enough to form a complex with islands, hold points,
  and named connectors.
- Its angle responds to the traffic flow; it may be oblique at a concourse end or
  orthogonal where a central alley meets a parallel route.

The current engine's repeated 600-foot-wide, full-depth edge steps centered on throat
stations are visually backward: the notch is generated first and the circulation meaning
is implied afterward. In the real charts, the taxilane paths determine where and how the
outer pavement boundary opens.

## 6. Other airside paved-surface families

### 6.1 Cargo ramps

- Cargo pavement is deep enough for large aircraft tails, loaders, service roads, and
  often a through taxilane.
- Warehouse faces are long and straight, so stand rows can be more regular than passenger
  gates, but the apron ends flare toward taxiways and remote hardstands.
- Multiple tenant buildings produce adjacent but not necessarily merged ramp rectangles.
  Service-road or leasehold gaps often separate them.
- KATL, KMIA, KSEA, KLAX, YSSY, and SBGR show cargo campuses rather than one building and
  one centered rectangle.

**Current mismatch:** one or two identical cargo bars sit behind a rectangular apron with
one central throat. This omits stand rows, tail roads, tenant divisions, and end exits.

### 6.2 General-aviation aprons

- GA aprons are organized by aircraft orientation: tie-down rows, T-hangar taxilanes,
  transient parking, FBO frontage, fuel access, and taxilanes between building rows.
- Their outline is often a union of narrow hangar courts and broader parking fields, not
  one deep rectangle in front of a hangar grid.
- T-hangar rows need long narrow access strips. Box hangars need individual courts or a
  shared lane. The FBO may have a semicircular/transient apron facing the taxiway.
- At mixed airports, multiple GA clusters may occupy different sides or ends of the field.

**Current mismatch:** a rectangular tie-down apron, an evenly spaced hangar array behind
it, and one central throat recur across nearly every role. This reads as a symbol for GA,
not a plausible GA pavement plan.

### 6.3 Maintenance and hangar courts

- Large maintenance hangars require very deep tow aprons aligned with their doors.
- Engine-run or compass-calibration areas may branch from the court but remain separated
  from routine taxi flow.
- Rows of small hangars use narrower taxilanes and repeated door-facing courts.
- Maintenance pavement often joins cargo or remote ramps at the edge of the terminal
  system, producing irregular but strongly directional shapes.

### 6.4 Remote, overflow, and RON aprons

- Remote aprons are sized as one or more explicit aircraft rows with a parallel taxilane.
- They commonly occupy leftover terminal notches, concourse ends, cargo edges, or a
  dedicated pad reached by a short spur.
- An apron used for overflow should have stand orientation and a circulation exit; a
  detached gray rectangle with a compass label is not sufficient evidence of use.
- Some remote areas are connected to passenger processors by bus roads or sterile
  corridors even when no building connector exists.

### 6.5 Deicing pads

- Dedicated deicing pads sit on the departure route near apron exits or runway queues,
  not arbitrarily beside the terminal.
- A pad contains two to six recognizable aircraft bays, a bypass or entry/exit system,
  and enough extra pavement for trucks and glycol collection.
- The outer polygon is usually rectangular or fan-like, but its internal lane/bay
  organization distinguishes it from a generic hold pad.
- Snow-climate references such as the Finnish charts reinforce that these pads belong to
  a larger winter-operations system.

### 6.6 Holding, run-up, penalty, and queue pads

- A holding bay widens a taxi route near a runway end and supports several independent
  queue positions or a bypass.
- A run-up pad places aircraft into oriented pockets so propeller or jet blast points away
  from active movement areas and buildings.
- A penalty box is a named operational holding surface connected to a busy taxiway system;
  it is not necessarily near a threshold.
- Scenic, compass, military arm/dearm, and engine-run pads have different orientation and
  clearance causes even when they share the same gray screen.

**Current mismatch:** these uses share a small rotated rectangle and label. The label
changes, but the paved morphology does not.

### 6.7 Military aprons

- Military ramps may contain parallel parking rows, shelters/revetments, arm/dearm pads,
  alert aprons, and broad tow lanes.
- They are commonly separated from civil pavement by controlled throats or security
  boundaries while remaining taxiway-connected.
- A pair of generic buildings behind one rectangle does not reproduce the dispersed or
  hardened campus visible at mixed civil/military fields.

### 6.8 Fire-station and emergency-access pavement

- Fire stations need a paved response court facing a direct route to runways and aprons.
- Vehicle pavement is much narrower than aircraft pavement and should connect to service
  or perimeter roads as well as the movement area.
- The current renderer draws the fire-station building but usually no readable response
  court or road, so the station floats in white space.

## 7. Landside paved surfaces that control apron shape

Although FAA diagrams emphasize the movement area, terminal roads and parking are essential
negative-space generators:

- **Loop/spine roads:** organize DFW, JFK, KLAX, and SFO unit terminals and determine which
  face is landside.
- **Curb roads:** form a narrow paved band immediately against the processor and prevent
  gray aircraft apron from wrapping the whole building.
- **Parking garages/lots:** occupy the concave pockets of unit terminals or the broad area
  opposite a linear processor.
- **Service and perimeter roads:** clip apron edges, cross throats at controlled points,
  and connect cargo, fuel, fire, maintenance, and remote stands.
- **APM/rail/road grade separations:** create bridges, tunnels, and preserved corridors
  through otherwise continuous terminal pavement.

The renderer need not give landside pavement the same gray fill as airside pavement, but
the spatial layer must exist for terminal and apron outlines to be causally related.

## 8. Surface boundaries, markings, and internal furniture

The real charts use internal objects to make a large gray field intelligible:

- gate/stand identifiers and parking orientation;
- lead-in/lead-out centerlines and stop points;
- apron taxilane centerlines and repeated route names;
- non-movement boundaries and hatched areas;
- service roads and controlled crossings;
- no-taxi islands, painted islands, shoulders, and closed pavement;
- ramp names and control/frequency sectors;
- hold positions at apron exits;
- bridge/underpass indications;
- surface-material or tenant boundaries where the publisher includes them.

Not every FAA page draws every line. The important finding is that large aprons acquire
meaning from at least some internal organization. Blank gray should be reserved for truly
undifferentiated pavement, not used as the default terminal background.

## 9. Boundary-shape causes

A plausible paved boundary should be explainable by one or more of these causes:

- offset from an aircraft-bearing building face;
- swept path of a taxilane or turning aircraft;
- pavement phase or terminal expansion joint;
- service/perimeter road;
- building, utility site, drainage course, or unpaved island;
- leasehold or movement-area limit;
- runway/taxiway safety clearance;
- property, shoreline, terrain, or urban constraint;
- deliberate space reserved for a future concourse or taxiway.

Random vertex noise is not an adequate substitute. Real irregularity is directional and
clustered: long straight construction edges alternate with bends, fillets, and steps where
the controlling cause changes.

## 10. What the current engine renders

The current implementation has useful primitives:

- apron kinds for terminal, GA, cargo, RON, deice, hold-pad, military, and overflow;
- gray polygon fills rendered beneath taxiway ribbons;
- terminal gate-depth bands selected broadly by traffic role;
- discrete apron-throat taxiways;
- GA tie-down marks and labels for several ramp types;
- taxiway fillet circles and flared runway-intersection polygons.

The visual problems come from composition rather than the presence of gray fill:

1. **Terminal apron as one bounding polygon.** All terminal pieces are enclosed by one
   large rectangle or stepped rectangle, regardless of which building edges bear gates.
2. **Repeated edge-step grammar.** Every throat cuts the same deep rectangular tab into
   the airside edge.
3. **One throat per district.** GA, cargo, military, and overflow areas usually receive a
   single centered straight connection even when their length suggests end exits or a
   through route.
4. **District rectangles.** GA, cargo, military, hold, and overflow uses differ mainly by
   size and label, not by their internal operational geometry.
5. **No apron taxilane layer.** The engine connects apron edges to the taxiway network but
   does not show the collection system inside the apron.
6. **Placeholder sub-aprons.** Parallel-concourse ramp labels may be attached to tiny
   polygons rather than to meaningful paved subdivisions.
7. **No landside cause.** Road loops, curbs, garages, and service roads do not constrain
   the polygon, so unit-terminal courts and linear-terminal fronts overfill with airside
   gray.
8. **No phase memory.** A complex generated from several buildings still receives a
   freshly regular outer slab rather than a union of differently aged pavement bands.

## 11. Reference patterns worth preserving

### FAA

- **KATL:** repeated concourse bars, but each inter-concourse ramp is a circulation
  corridor with routes and unequal ends.
- **KDEN:** three midfield bars in a disciplined stack; long dual-face aprons and broad
  end connections, not one featureless rectangle.
- **KDFW:** pavement wraps the convex side and ends of five deep horseshoes while preserving
  the landside road courts.
- **KLAX, KJFK, KSFO:** terminal and apron orientations rotate around road loops; the
  central landside void is as important as the gray exterior.
- **KCLT, KMIA, KORD:** pier alleys of unequal depth and width merge into dense root
  pavement and a limited set of collectors.
- **KBOS:** constrained, lobed aprons follow shore, roads, and dissimilar terminal units.
- **KSEA and PANC:** passenger, cargo, and remote/maintenance surfaces form a long connected
  sequence but retain distinct local ramp identities.
- **KITH:** a small terminal needs only a shallow articulated apron, making it a useful
  control against hub-scale overpaving.

### International corpus

- **Australia:** clear distinctions among domestic/international aprons, GA courts,
  maintenance areas, and hot-spot insets; geographic constraints visibly clip pavement.
- **Brazil:** long tenant ramps, coastal boundaries, construction phases, and colored
  restrictions make apron edges locally specific.
- **Finland:** holding/deicing/winter-operation surfaces and service routes add structure
  beyond the basic gate apron.
- **India and Latvia:** stand/marking/lighting diagrams make the internal organization of
  even small paved areas explicit.
- **South Africa:** civil terminal, freight, GA, and military precincts are differentiated
  by their apron relationships as well as by labels.

## 12. Descriptive contract for future generated pavement

A convincing generated airport should satisfy the following observable conditions:

- Every gate-bearing building face has an apron band appropriate to its aircraft class.
- Landside faces and road courts are not accidentally filled as aircraft pavement.
- Pier alleys contain a plausible shared or paired taxilane and a workable end condition.
- Midfield bars have active circulation on both faces and meaningful end connections.
- Terminal pavement reaches the taxiway network through a small number of route-derived,
  flared throats.
- Cargo, GA, maintenance, military, RON, deicing, and holding surfaces have distinct
  morphologies, not just different labels.
- Large gray regions contain enough markings, routes, boundaries, or named subdivisions
  to explain how they operate.
- Apron irregularity has a cause; long construction edges remain long where no cause
  changes.
- The complete non-runway pavement reads as one connected hierarchy of taxiways,
  taxilanes, aprons, and local courts, with intentional exceptions clearly explained.
- The terminal silhouette and apron silhouette tell the same story: gates face gray,
  curbs face roads, satellites receive halos, and expansion leaves asymmetric seams.

## 13. Anti-patterns exposed by the audit batch

- One gray rectangle containing all terminal buildings.
- A gray rectangle centered symmetrically around a one-sided linear terminal.
- Repeated 600-foot rectangular notches standing in for apron exits.
- Black concourse bars floating in a gray slab without face-parallel taxilanes.
- A C-shaped terminal whose concave road court is filled as apron.
- One centered throat serving a very long cargo or GA ramp.
- A labeled RON, deicing, military, or hold pad with no use-specific internal geometry.
- Hangar rows separated from their apron by white space or lacking door-facing taxilanes.
- A fire station, fuel farm, or maintenance building without service pavement.
- Randomly jagged apron edges whose vertices do not correspond to gates, routes, roads,
  safety areas, or development phases.
