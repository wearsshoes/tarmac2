# Diagram object categories not addressed by the program

## Purpose and status vocabulary

This is the broad content-model gap inventory from the 71 real-airport SVGs. It includes
mapped ground objects, operational symbology, chart furniture, data tables, and geographic
context. `ungenerated-ground-features.md` provides the physical-feature detail; this
document asks the higher-level question: what kinds of diagram object have no first-class
representation in the current `SiteModel` and renderer?

The distinctions matter:

- **Unmodeled**: there is no first-class type or collection for the object.
- **Constraint only**: data exists and influences generation but is not rendered.
- **Text only**: the engine may mention the category in a generic note, but has no mapped
  object or structured record.
- **Partial**: a related object exists, but the observed category cannot be expressed with
  the current fields.

This is an investigation artifact, not a commitment to support every publisher or every
object listed.

The FAA construction standards review adds a second guardrail. AC 150/5370-10H confirms
that fences, drainage structures, wind cones, lighting systems, signs, markings, and
multiple pavement materials are distinct installed asset families. Their presence in a
construction specification does not mean the FAA Airport Diagram must portray each one.
This inventory records a modeling gap separately from a default-rendering requirement.

## 1. Cartographic and geographic layers

| Category | Current status | What the real diagrams contain |
|---|---|---|
| Airport boundary and fence | Constraint only / unmodeled | The parcel polygon exists, but neither it nor fence/gate segments render. |
| Runway protection and restriction areas | Constraint only | `protectionZones` influence building clearance but are invisible; there is no rendered BRL, RSA, OFA, OFZ, or clearway family. |
| Water and drainage | Unmodeled | Coastlines, rivers, lakes, ditches, ponds, estuaries, reclaimed-land edges. |
| Terrain and elevation | Unmodeled | Contours, spot heights away from runway ends, slopes, embankments, cut/fill edges. |
| Vegetation and land cover | Unmodeled | Forest, tree lines, scrub, grass, wetland, beach, and significant trees. |
| Urban/built context | Unmodeled | Built-up shading, adjacent industrial blocks, neighborhoods, off-airport roads. |
| Roads and rail | Unmodeled | Public roads, perimeter/service roads, rail, stations, bridges, tunnels, and grade separation. |
| Survey/control points | Unmodeled | Airport reference point, datum/control monuments, coordinate callouts, and benchmark sites. |
| Obstacles | Unmodeled; optional in current FAA profile | Towers, poles, masts, cranes, tanks, stacks, power lines, trees, and obstacle elevations occur in the broader corpus. The 6 May 2025 IAC 9 change removes the highest-obstacle depiction from FAA Airport Diagrams; Appendix 1 retains a generic obstruction symbol for explicitly sourced safety content. |

The current map has only the airport's operational geometry on a white plane. That is a
valid stylization, but it leaves no way to express why a field is constrained or why its
layout is asymmetric.

## 2. Runway object families

| Category | Current status | Missing expressiveness |
|---|---|---|
| Full runway markings | Partial | No threshold keys, in-pavement designators, aiming points, touchdown-zone bars, edge lines, or marking condition. |
| Runway lighting installations | Partial | A `centerlineLights` flag renders the IAC negative-dot pattern. Edge-light intensity, touchdown-zone, threshold/end, REIL, RLLS, pilot-control, and status-light facts are not modeled. |
| Approach lighting | Unmodeled | No ALS type, bars, flashers, or threshold-side miniature symbol. |
| Visual glide-slope indicators | Unmodeled | No PAPI/VASI/T-VASIS type, side, position, or aiming data. |
| Arresting systems | Partial | EMAS is represented; cables, nets, barriers, and other arresting gear are not. |
| Stopway/clearway/declarations | Partial | Blast pad and displacement exist, but stopway, clearway, TORA/TODA/ASDA/LDA records and their mapped limits do not. |
| Surface material and condition | Partial | PCN string exists, but asphalt, fuel-resistant asphalt, concrete, aggregate-turf, turf/gravel, shoulders, grooving, friction, contamination, and condition are not modeled independently. |
| Runway intersection elevations | Unmodeled | Only end elevations and a slope value exist; no surveyed intermediate elevation points. |
| Alternate/secondary runway uses | Unmodeled | No water runway, ski strip, ultralight strip, or separate grass-strip grammar. |

## 3. Taxiway, holding, and apron object families

| Category | Current status | Missing expressiveness |
|---|---|---|
| Taxiway markings | Unmodeled | Centerlines, enhanced centerlines, edges, shoulder stripes, surface-painted signs. |
| Signs and lights | Unmodeled | Direction/location signs, clearance bars, stop bars, guard lights, lead-on lights. |
| Holding-position variants | Partial | Basic and ILS/CAT II bars exist, but runway-approach-area, precision critical-area, and surface-sign variants are not structured. |
| Holding bays and run-up bays | Partial | Generic hold-pad apron exists; individual slots, bypass paths, blast orientation, and painted limits do not. |
| Movement-area boundaries | Unmodeled | No non-movement line/hatching, ramp tower boundary, or controlled-area polygon. |
| Stand/gate positions | Unmodeled | No stand ID, aircraft class, orientation, lead-in/lead-out, stop point, or gate relationship. |
| Pushback and service circulation | Unmodeled | No pushback path, tug point, equipment lane, bus route, or head/tail service road. |
| Surface construction/state | Partial | A whole runway may be closed; preparation, overlay, partial removal, repair, closed taxiway/apron segments, construction phases, barricades, and temporary routes are absent. Physical lifecycle, operational availability, and marking state are collapsed. |
| Bridges and tunnels | Unmodeled | No grade-separated taxiway/road/people-mover relationship. |
| Deicing facilities | Schema-only in apron kind | `deice` is an allowed apron kind, but current generation does not produce the pad, bays, collection area, or operating geometry. |

## 4. Terminal and landside systems

| Category | Current status | Missing expressiveness |
|---|---|---|
| Terminal identity hierarchy | Partial | Buildings have a label, but there is no terminal → concourse → pier → gate hierarchy or stable relationship model. |
| Landside roads and curbs | Unmodeled | No road loop/spine, arrivals/departures curb, ramps, bridges, or terminal frontage. |
| Parking and ground transport | Unmodeled | No garages, surface lots, rental-car centers, bus/shuttle areas, taxi staging, or rail station. |
| People mover and connectors | Unmodeled | No APM guideway/station, tunnel, bridge, or connection semantics for a detached concourse. |
| Customs/international processing | Unmodeled | No customs, FIS, bonded-area, sterile-corridor, or border-service objects. |
| Construction and phased terminal growth | Unmodeled | No explicit phases, closed gates, temporary processors, or old/new building distinction. |
| Tenant/functional subdivisions | Unmodeled | No airline, cargo tenant, maintenance, catering, postal, hotel, administration, police, or utility function beyond the small building-kind enum. |

Because these categories are missing, current terminal archetypes are shapes without the
landside and gate-side systems that normally produce those shapes.

## 5. Navigation, surveillance, weather, and communication objects

The model contains frequency rows and a generic tower/beacon building. It does not contain
located equipment records for:

- VOR, VOR/DME, VORTAC, TACAN, and NDB sites;
- primary/secondary radar, ASDE surface radar, radar domes, and multilateration sensors;
- RVR touchdown/midpoint/rollout installations;
- ASOS/AWOS sensor sites, ceilometers, visibility sensors, and wind sensors;
- windsocks, segmented circles, tetrahedrons, and landing-direction indicators;
- remote communication outlets, transmitter/receiver farms, and antenna sites;
- compass roses/calibration pads and radar reflectors.

LOC, LOC/DME, offset localizer, and ILS components are also unmodeled, but IAC 9
§3.5.2.21 explicitly excludes them from the NAVAIDs required on the current FAA Airport
Diagram. They belong only to a non-FAA publisher profile or a separately justified
product scope.

These are not just decorative symbols. The real charts locate them relative to safety
areas, taxiways, and buildings, and sometimes attach critical notes to them.

## 6. Vehicle, aircraft, and hazard objects

The current model has no entity representing an aircraft or ground vehicle. Consequently
it also cannot express:

- stand occupancy envelopes or aircraft-size restrictions;
- towed-aircraft routes and tug crossings;
- vehicle service-road crossings and controlled gates;
- hot-cargo, engine-run, blast, or prop-wash areas;
- bird/wildlife hazards, landfill or quarry areas, and construction-crane zones;
- firefighting training sites, burn pits, or emergency-access routes;
- snow-storage areas and snow-removal routes;
- fuel-truck routes, hydrant pits, and refueling exclusions.

Hotspots are modeled as ellipses with short reasons, but they are not linked to a typed
hazard, a route conflict, or the chart note that explains required pilot action.

## 7. Operational overlays and special-use areas

| Category | Current status | Notes |
|---|---|---|
| Hotspot explanatory text | Partial | Circle/leader/reason exist, but there is no structured multi-line hotspot instruction block. |
| Low-visibility routes and critical areas | Partial | ILS/CAT II hold bars exist; LVP routes, ILS critical polygons, and surface-movement restrictions do not. |
| Runway-incursion mitigation systems | Text only / unmodeled | A note can mention ASDE-X; no status-light or alert-zone objects exist. |
| LAHSO system | Partial | Marks are generated geometrically, but available landing distance and operation-specific note records are absent. |
| Noise-abatement and preferential routes | Unmodeled | No mapped arrows, prohibited-turn areas, or ground-run restrictions. |
| Military/civil control divisions | Partial | A generic military apron/building exists; security boundaries, alert areas, arm/dearm pads, and revetments do not. |
| Customs/quarantine restrictions | Unmodeled | Common in international references, especially at mixed domestic/international aprons. |
| Time/condition-dependent closures | Unmodeled | No effective period, NOTAM state, seasonal surface, or conditional-use object. |

## 8. Chart furniture and tables

The engine renders a title system, graticule, communications block, field elevation,
magnetic variation, PCN list, caution, ramp frequencies, generic notes, and hotspots. The
real diagrams contain additional page objects without an equivalent model:

- declared-distance tables with TORA, TODA, ASDA, and LDA by runway direction;
- full physical-characteristics tables, including surface, slope, bearing strength,
  strip dimensions, and lighting;
- runway-marking and lighting profile panels;
- airport-diagram legends and symbol keys;
- scale bars and representative fractions;
- enlarged hot-spot, apron, congested-area, or runway-end insets;
- continuation pages and page-index/coverage diagrams;
- runway exit-distance diagrams and rapid-exit information;
- coordinate tables for thresholds, intersections, stands, and navigation aids;
- lighting-aid and approach-aid tables;
- parking/stand restriction tables;
- survey source, datum, revision, and amendment panels;
- obstacle tables and takeoff-climb-surface notes (international/legacy profile, not a
  default current-IAC requirement);
- rescue/fire category and hours tables;
- snow-plan, low-visibility, or surface-condition boxes;
- publisher-specific color legends and amendment highlighting.

The fixed `notes: string[]` escape hatch can print some of this prose, but it cannot lay
out, relate, validate, or selectively render these as distinct object categories.

## 9. Publisher and page-system categories

The program has one FAA-like visual system. The corpus demonstrates page-system concepts
that are absent rather than merely restyled:

- Complete inside-neatline landscape/rotated modes and charts with a separate table band.
  The current renderer rotates mapped geometry for east-west fields but leaves interior
  furniture upright; IAC-9 Appendix 7 rotates the inner content while retaining
  page-readable outer margin/title data.
- Multi-panel pages combining plan view, profile, inset, and lighting/marking diagram.
- Multiple sheets for one airport, with coverage indicators and cross-references.
- Color layers with semantic roles, such as Brazil's red warnings, India's marking/light
  colors, Finland's yellow emphasis, and cyan or gray geographic context.
- Publisher-defined line/symbol dictionaries and unit systems.
- Per-publisher title blocks, revision histories, copyright/source notices, and effective
  date systems.

Supporting any of these faithfully would require a chart-document model above `SiteModel`,
not only additional SVG drawing functions.

## 10. Existing data that currently disappears

Two current model categories deserve special attention because generation work is already
being done but no visible object results:

- `parcel`: defines a synthetic airport boundary but is not passed through a boundary or
  context layer in the renderer.
- `protectionZones`: generated for runway ends and used while relocating buildings, but
  not rendered as RPZ/clearway/restriction geometry or exposed in chart notes.

`windHeading` is also retained in the model but only indirectly visible through runway
orientation; there is no wind-coverage diagram or wind-rose furniture.

## 11. Categories that are addressed today

For clarity, the program already has first-class support for: fictional identity and
cycle; traffic role and design code; runway geometry, ends, slope, closure, PCN, displaced
threshold, blast pad, EMAS, and centerline-light flag; taxiway centerline geometry and
basic route kinds; basic and precision hold lines; generic apron and building families;
hotspots; LAHSO; communications and ramp-frequency rows; cautions and notes; terminal
archetype; graticule and FAA-like page margins.

Several of those categories are visually simplified, but they are addressed and belong
in the discrepancy audit rather than this unaddressed-object list.
