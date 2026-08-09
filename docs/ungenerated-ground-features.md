# Ground features and airfield furniture absent from generated charts

## Scope

This document inventories physical features visible in the 71 checked-in real-airport
SVGs but absent, or absent in meaningful detail, from the 36-diagram current-engine audit
batch. It is about objects on or immediately around the airport: pavement furniture,
equipment, roads, buildings, land cover, and other mapped physical context. Page-level
tables and purely informational symbols are covered in `unaddressed-diagram-objects.md`.

“Absent” here means not visibly generated as a distinct object family. A word appearing
in a note is not the same as a mapped object; similarly, a gray rectangle labeled `RAMP`
does not count as stand, taxilane, or service-road detail.

AC 150/5370-10H confirms that many items below are independent physical installations or
construction states. That strengthens the case for first-class data, but IAC 9 and the
publisher profile still decide which are visible on an Airport Diagram.

## 1. Aircraft stands and gate furniture

These are the most common missing terminal-area features.

- Individual stand or gate positions, including gate numbers and letter-number ranges.
- Nose-in lead-in centerlines, stop positions, lead-out paths, and power-in/power-out
  orientation.
- Pushback envelopes, tug-release points, and pushback-hold locations.
- Aircraft silhouettes or stand-envelope outlines used to communicate permitted parking.
- Widebody versus narrowbody stand modules and MARS alternate-use positions.
- Remote stands and RON rows with individual markings instead of a generic apron label.
- Small-aircraft tie-down layouts as actual rows/orientations. The engine draws plus-like
  marks on some GA aprons, but not the varied T, ring, or parking-bay patterns in the real
  charts.
- Helipads, helicopter stands, and their approach/departure or touchdown markings.

The FAA hubs show this most clearly around terminal and cargo ramps; the Australian,
Finnish, Latvian, and Indian diagrams often show explicit stand numbers or parking
orientation even at relatively small fields.

## 2. Apron-internal circulation

- Apron taxilane centerlines, especially paired or looping taxilanes between concourses.
- Head-of-stand and tail-of-stand service roads.
- Equipment lanes, bus lanes, and vehicle crossings across taxilanes.
- Apron islands, painted no-taxi islands, safety envelopes, and equipment staging pockets.
- Movement/non-movement boundaries and the hatching or line convention that distinguishes
  them.
- Apron edge markings, shoulder limits, and changes between concrete, asphalt, gravel,
  and grass.
- Named ramp subdivisions with boundaries that correspond to real circulation, rather
  than point-sized placeholder aprons.
- Gate-control or ramp-control sector limits.

Real terminal aprons are internally organized spaces. The current renderer depicts them
as nearly featureless gray fields, so the buildings appear to sit on a slab rather than
participate in an operating gate system.

## 3. Taxiway and runway pavement furniture

The engine has runway bars, taxiway ribbons, hold lines, some fillets, displaced
thresholds, blast pads, EMAS, closed runways, and LAHSO. The following common refinements
are still absent:

- Painted taxiway centerlines and enhanced centerlines approaching a runway.
- Dashed edge markings, solid edge markings, shoulder stripes, and surface transitions.
- Surface-painted holding-position signs and surface-painted location/direction signs.
- Runway-guard lights, stop bars, and clearance-bar locations.
- Bypass taxiways and multi-position holding-bay slot markings.
- Turning pads with marked turning paths and nose-wheel guides.
- Run-up pads with individual bays, blast orientation, and painted limits.
- Arresting gear/cables and engineered arresting systems other than the generated EMAS
  bed representation.
- Runway threshold “piano keys,” designation numerals on the pavement, aiming-point blocks,
  touchdown-zone bars, edge lines, and runway centerlines as a full marking family.
- Runway shoulder and stopway distinctions; the present blast-pad/EMAS treatment does not
  cover all declared-distance or paved-overrun cases.
- Construction areas, temporary pavement, barricades, unusable pavement, and phase limits.
- Physical surface classes and transitions: asphalt, fuel-resistant asphalt, concrete,
  aggregate-turf, turf, and gravel. The default FAA profile may portray several of these
  identically, but the airport model should not collapse them.
- Marking lifecycle separate from pavement lifecycle: new/final, temporary, removed,
  obscured/ghosted, and absent marking states on otherwise existing pavement.

## 4. Airfield lighting and visual aids

Lighting is pervasive in the international charts and regularly annotated in FAA
diagrams. The current engine maps centerline lights as a negative-dot pattern and can add
generic lighting-related notes, but does not model the larger installation family.

- Approach-light systems and their bars, sequenced flashers, or simplified chart symbols.
- PAPI, VASI, T-VASIS/AT-VASIS, and other visual glide-slope indicator sites on the correct
  side of each runway.
- REIL positions.
- Runway edge, threshold, end, and touchdown-zone lighting; centerline lighting beyond the
  existing boolean/dot-pattern representation.
- Taxiway centerline and edge lighting.
- Stop bars, runway-status lights, and runway-entrance lights as physical installations.
- Apron floodlight masts and high-mast lighting rows.
- Lighted windsocks and landing-direction indicators.
- Lighting control boxes, pilot-controlled-lighting locations, and lighting-aid inset
  diagrams.

The renderer sometimes includes a note that a system is in use, but the equipment and
its spatial relationship to the runway are not drawn.

## 5. Navigation, surveillance, weather, and communications sites

- ILS localizer arrays beyond runway ends and glide-slope antenna sites beside runways
  (international/reference scope; IAC 9 §3.5.2.21 excludes LOC and ILS components from
  the NAVAIDs required on current FAA Airport Diagrams).
- VOR, VOR/DME, DME, TACAN, and VORTAC sites with their distinct symbols and service roads.
- NDB and locator sites.
- RVR transmissometers at touchdown, midpoint, and rollout stations.
- ASDE-X/ASDE surface-radar sites and radar domes.
- Primary/secondary surveillance radar and airport-surface radar installations.
- ASOS/AWOS sensor fields, ceilometers, visibility sensors, and wind-sensor masts.
- Windsocks/wind cones, segmented circles, tetrahedrons, and landing-direction indicators.
- Radio antenna farms, localizer shelters, marker beacons, and radar reflectors.
- Compass-calibration pads and compass roses.

The engine generates a tower/beacon building symbol and communications text, but not this
larger family of located equipment.

## 6. Roads, rail, parking, and landside circulation

Every large real terminal derives much of its shape from landside circulation. The
generated charts omit that causal layer.

- Public access roads, terminal loop roads, one-way arrivals/departures curbs, and ramps.
- Service/perimeter roads and controlled vehicle gates.
- Parking garages, surface parking lots, rental-car centers, and shuttle/bus roads.
- Rail lines, people-mover guideways, stations, and terminal connectors.
- Bridges, tunnels, underpasses, and roads or taxiways passing over/under one another.
- Landside property entrances, security checkpoints, and named gates.
- Road bridges or causeways across water and public roads crossing approach areas.

The absence is particularly visible against DFW, JFK, KLAX, KSFO, KBOS, KDEN, EFHK,
YSSY, and SBGR. Their terminal units cannot be understood fully without the loop or spine
that organizes them.

## 7. Boundaries, fences, and protected areas

- Airport property boundaries and leased-area boundaries.
- Perimeter/security fences and fence gates.
- Customs/bonded-area boundaries and international-arrivals segregation.
- Runway and taxiway safety areas when charted.
- Object-free areas, obstacle-free zones, runway-protection zones, and building-restriction
  lines.
- Clearways, declared-distance limits, and threshold-to-boundary relationships.
- Military/civil, airline-tenant, and controlled/uncontrolled area limits.
- Wildlife-control fencing and access-control points.

The model calculates a parcel and runway protection zones, but the renderer does not draw
either. They therefore constrain some generated placement without appearing as charted
ground features.

## 8. Drainage, water, terrain, and land cover

These are strongest in the non-FAA references but also matter at airports such as BOS,
JFK, SFO, DCA, ANC, Cairns, Hobart, Helsinki, and Santos Dumont.

- Coastlines, rivers, lakes, drainage channels, retention ponds, wetlands, and shoreline
  structures.
- Terrain contours, spot elevations away from the runway, embankments, cut/fill edges,
  levees, and steep-slope limits.
- Grass versus paved areas, scrub, forest, tree lines, and individual significant trees.
- Built-up/urban areas and large adjacent industrial footprints.
- Dunes, beaches, mudflats, and reclaimed-land edges.
- Ditches, culverts, stormwater ponds, and drainage paths that shape pavement.

The current parcel is an invisible synthetic constraint, so every generated airport
appears to occupy an abstract white plane even when its identity suggests a coastal,
mountain, river, desert, or urban setting.

## 9. Obstacles and off-airport hazards

This is primarily an international/context inventory. The 6 May 2025 IAC 9 change removes
the highest-obstacle depiction from current FAA Airport Diagrams, although Appendix 1
retains a generic obstruction symbol and an explicitly requested safety feature may still
be charted. These items should not be generated by default merely to satisfy the FAA
profile.

- Towers, poles, masts, cranes, smokestacks, tanks, silos, and transmission lines.
- Buildings penetrating or near approach surfaces, with elevation callouts.
- Tree groups and terrain obstacles.
- Road and rail crossings under approach paths.
- Bird/wildlife hazard areas, landfill warnings, quarry/blasting areas, and water hazards.
- Ships, marina masts, or harbor features where they affect coastal approaches.
- Temporary cranes and construction obstacles.

These features explain displaced thresholds, approach minima, and unusual runway or
taxiway placement. Without them, generated constraints look arbitrary.

## 10. Building and facility types not represented as ground objects

The engine has terminal, concourse, hangar, FBO, cargo, fire, tower, fuel, and military
building kinds. The real charts add many more functional silhouettes:

- Airline maintenance/MRO bases and engine-test cells.
- Snow-removal equipment buildings and deicing-fluid storage/recovery facilities.
- Customs, immigration, quarantine, and border-service buildings.
- Catering, commissary, postal/mail, and ground-service-equipment buildings.
- Rescue/fire training grounds and burn pits, distinct from an operating fire station.
- Airport administration, police, operations, and security buildings.
- Aeroclubs, flight schools, fixed tenant buildings, and general-aviation terminals.
- Military armories, alert shelters, revetments, and aircraft shelters.
- Hotels and conference facilities inside the airport road system.
- Power substations, generators, utility plants, water tanks, sewage plants, and pump
  stations.
- Engineered noise barriers, blast fences, and jet-blast deflectors.

## 11. Regional ground features exposed by the wider corpus

Some object families are publisher- or region-heavy but still useful evidence:

- Australian charts: extensive coastline/estuary context, urban shading, inset hot-spot
  pavement, movement-area boundaries, and airport roads.
- Brazilian charts: shoreline and reclaimed land, strong construction/restriction notes,
  colored safety overlays, and apron stand detail.
- Finnish charts: snow-climate holding points, detailed service roads, multiple windsocks,
  terrain/water context, and yellow highlighted hot-spot or maneuvering areas.
- Latvian charts: fences/service roads and separate runway-marking/lighting panels.
- Indian charts: airport boundaries, color-separated markings and lighting, and full
  runway-marking profiles.
- South African charts: large civil/GA precincts, apron limits, terminal and freight
  functions, and bottom-table data tightly tied to the mapped surfaces.

## 12. What is already present and should not be double-counted

The following are not gaps, although several need greater variety or detail: hard-surface
runways; taxiway ribbons and simple fillets; parallel, connector, exit, crossfield, service,
and apron-throat routes; basic and ILS/CAT II hold lines; LAHSO; displaced thresholds;
blast pads; EMAS; closed runways; generic terminal/GA/cargo/RON/hold/military/overflow
aprons; terminal, concourse, hangar, FBO, cargo, fire, tower/beacon, fuel, and military
buildings; generic GA tie-down marks; and hotspot circles/leaders.
