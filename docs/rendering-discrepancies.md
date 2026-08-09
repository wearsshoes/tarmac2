# Rendering discrepancy audit

## Scope and method

This is an investigation record, not an implementation plan. It compares 36 diagrams
rendered from the current engine in `reference/generated/audit-*.svg` with the 71 SVGs
actually present under `reference/real-airports/`. The generated cohort contains three
natural seeds for each traffic role plus forced examples of every terminal archetype.
The visual comparison gives the 15 FAA charts the greatest weight; the international
charts are used to check which findings are FAA-specific and which are general chart
or airport-layout findings.

The corpus metadata currently says 73 files, but the checked-out directory contains 71.
`FAOR.svg` and `FALE.svg` are listed in the manifest but are not present, so neither was
part of this audit.

## Executive finding

The current output has the correct broad FAA visual vocabulary: portrait sheet, dual
margin bands, a neatline, black runways and buildings, gray pavement, sparse brown hot
spots, graticules, and small all-caps annotation. At thumbnail size it belongs to the
right family. At reading size it diverges because the airport is assembled from a small
number of clean geometric recipes, while the real charts describe dense, connected,
surveyed sites with accumulated irregularities. The largest perceptual difference is
not typography; it is the amount and topology of operational detail.

## 1. Sheet composition and use of space

### Generated output

- Every chart uses the same 900 by 1200 portrait sheet and the same basic furniture
  vocabulary. Scale varies, but the page still reads as a stable application template.
- Small and regional fields often leave very large blank quadrants. The airport can
  occupy only a narrow diagonal through the center while a few text blocks float at the
  corners.
- Large fields shrink the entire airport to make the generated extents fit. The terminal
  and individual taxiways then become icon-like even when there is unused space elsewhere
  on the page.
- Furniture is packed around obstacle boxes rather than placed according to a publisher's
  conventional reading sequence. It is collision-aware but does not always feel authored.

### Real FAA charts

- White space is deliberate but is used aggressively for frequencies, runway-strength
  data, lighting notes, declared distances, cautions, variation graphics, insets, and
  operational notes. KORD, KLAX, KMIA, and KATL are dense almost to the neatline; KITH is
  sparse because the airport and its operational data are genuinely small.
- Landscape-like airport orientations are handled by rotating the mapped airport and,
  in some FAA cases, effectively reading north from a side. The page is composed around
  the airport rather than simply fitting one invariant arrangement.
- Furniture clusters have recognizable roles: frequency material forms a compact column,
  runway data forms aligned lists, and notes sit next to the feature or decision they
  qualify.

### Discrepancy

The generated page is too consistent across airport roles. Sparse charts lack meaningful
secondary information, while hub charts reduce map legibility before they exhaust the
available composition choices. The result is cleaner than the references but also less
credible.

## 2. Airfield topology

### Runway systems

The generated runway-role hierarchy is visible and generally plausible. Long black bars,
parallel banks, crosswind runways, displaced thresholds, blast pads, EMAS, slope text,
and occasional closed runways all appear. The discrepancies are in repetition and local
context:

- Parallel banks use a small set of separations and staggers, so unrelated seeds acquire
  the same visual rhythm.
- Crosswind and repair routes can create conspicuously straight diagonals through the
  middle of a field. They solve graph connectivity but do not resemble a route selected
  around runway safety areas, existing pavement, drainage, or buildings.
- Threshold areas are schematic. Real charts collect turnoffs, bypasses, holding bays,
  ILS hold positions, stop bars, approach-light symbols, and pavement transitions near
  each end. Generated ends usually contain one jogged parallel and one or two simple
  connectors.
- The generated runway annotation is regular and isolated. Real FAA charts place end
  elevation, magnetic heading, dimensions, slope, lighting, declared-distance, and
  weight-bearing information as a coordinated family, often with multiple callouts at
  crossings.

### Taxiway networks

This is the strongest geometry discrepancy.

- Generated taxiways are mostly one parallel per runway, evenly spaced right-angle
  connectors, a small number of high-speed exits, and straight crossfield links. Real
  KORD, KATL, KDFW, KLAX, and KMIA contain several longitudinal routes per runway bank,
  braided connectors, perimeter routes, paired apron taxilanes, bypasses, loops, and
  short local links that reflect construction history.
- Real connector spacing is irregular and purpose-driven. It tightens at terminal exits
  and runway ends, and gaps appear where buildings, safety areas, and runway crossings
  intervene. Generated connectors have a visibly algorithmic cadence.
- The real pavement network reads as a single, continuous organism. Generated terminal,
  cargo, GA, and military aprons are commonly joined by only one narrow throat apiece,
  making districts read as attached tiles rather than parts of one operating surface.
- Curves and fillets are too small in the generated charts to change the network's
  rectilinear character. The real charts use broad turning geometry, especially for
  high-speed exits and ADG V/VI taxilanes.
- Taxiway naming is legible in the generated output, but labels repeat less often and
  carry less local structure. Real charts make letter families and numbered connectors
  communicate geography; generated names mostly reveal route-length ordering.

## 3. Pavement and apron shape

- Generated aprons are simple rectangles or large stepped polygons in one gray tone.
  Their outer edges are often much straighter than any other feature on the chart.
- The terminal apron is especially oversized and uniform in the parallel, satellite,
  unit, and semicircle samples. A few black building bars sit on an uninterrupted gray
  slab. In the real FAA diagrams, gray follows concourse faces, gate envelopes, taxilanes,
  islands, roadway voids, ramp boundaries, construction joints, and adjacent tenant
  aprons.
- The current stepped terminal edge repeats full-depth rectangular notches at throat
  stations. Real apron edges taper, flare, bend, and merge; a throat usually joins a
  taxilane network rather than cutting a repeated notch into a common rectangle.
- Small generated ramps are always geometrically clean. Real GA and cargo aprons are
  frequently trapezoidal, clipped by roads or property boundaries, extended in phases,
  or divided into movement and non-movement areas.
- The renderer's single gray matches the core FAA convention reasonably well. What is
  missing is not another shade so much as internal structure: stand lead-ins, taxilane
  centerlines, non-movement hatching, closed pavement, surface boundaries, and named
  sub-aprons.

## 4. Terminal complexes

The forced archetype samples show that every current morphology is visually distinct,
but they also expose common simplifications.

- `audit-pier-mid-a.svg` produces an immediately recognizable comb/E silhouette, yet its
  piers are nearly constant-width bars with independent cap glyphs. KCLT, KBOS, KORD, and
  KMIA have stepped widths, uneven roots, infilled joints, angled faces, and additions
  that merge into one accreted mass.
- `audit-parallel-mega-a.svg` and `audit-satellite-mega-a.svg` resemble the idea of ATL
  or DEN, but the buildings float on a single rectangular apron and the gaps between bars
  contain little more than a label. Real midfield systems devote those gaps to multiple
  taxilanes, pushback areas, service roads, hold points, and distinct ramp names.
- `audit-semicircle-major-a.svg` uses shallow arc bands strung along a line. DFW's units
  are much deeper C/horseshoe forms with blunt ends, internal road courts, bridges, and
  nonidentical additions. The generated arcs read as decorative parentheses rather than
  buildings enclosing landside space.
- `audit-unit-major-a.svg` and the natural major-hub unit samples repeat isolated black
  symbols at regular pitch. KLAX, JFK, KSFO, and KBOS show units related by a road loop or
  spine, but each unit has a different orientation, footprint history, and apron depth.
- Processor and concourse components are frequently separate overlapping polygons in the
  engine. At page scale their seams can read as arbitrary black joints or disconnected
  pieces. Real chart silhouettes can be fragmented, but their fragments usually trace a
  roadway void, bridge, tunnel relationship, or known building break.
- Terminal labels in the generated charts are generic and few. Real hubs name terminals,
  concourses, piers, ramps, gates, holding pads, tower sectors, and customs areas, giving
  the footprint operational meaning.

See `terminal-geometry-catalog.md` for the per-airport description and the corrected
taxonomy in `terminal-design.md`.

## 5. Buildings and airport districts

- Generated hangars commonly form perfectly spaced rows of identical rectangles. This is
  convincing as a diagrammatic shorthand but overused across roles. Real hangar districts
  mix T-hangar bars, box hangars, maintenance halls, sheds, and voids, and are clipped by
  local roads and older apron edges.
- Fuel farms are consistently four square black blocks. Real charts show tanks as circles,
  small clusters, or a labeled area; some do not depict them at all.
- Cargo campuses are usually one or two identical bars behind a rectangular ramp. Real
  cargo areas at KATL, KSEA, KMIA, KLAX, YSSY, and SBGR consist of tenant-specific buildings,
  deep docks, multiple hardstands, service roads, and irregular extensions.
- Fire stations, towers, FBOs, and military areas are present, which is valuable, but their
  placement has weak visible dependence on road access, line of sight, response routes,
  or tenant history.
- The same district set recurs at nearly every airport. Real diagrams omit irrelevant
  categories and add locally dominant ones such as maintenance bases, airline hangars,
  snow equipment, coast-guard facilities, customs, helicopter areas, or aeroclubs.

## 6. Labeling and typography

- The generated type system is clean, consistent, and readable. At normal zoom it is
  slightly too uniform: the same few classes cover airport identity, operational data,
  facilities, and route labels.
- Real FAA text is denser and more feature-aligned. Labels rotate with long taxiways,
  repeat along routes, use forked leaders for clusters, and form compact tables with very
  tight leading.
- Generated halos are stronger and more pervasive. They protect legibility but can make
  labels look pasted over the chart. Real charts rely more on choosing a clear position,
  interrupting a line, or using a leader.
- Facility labels sometimes sit far from small generated buildings because the collision
  solver finds a legal opening. The leader proves association but the placement has no
  local grouping logic.
- Essential labels can still be forced into overlaps in dense samples; the SVG root records
  these events. The real references also contain crowded areas, but the conflicts are
  usually resolved by moving secondary text into a table or inset rather than accepting
  local ambiguity.

## 7. Graticule, margins, and furniture

- The generated neatline and dual top/bottom margin bands are a strong high-level match
  to FAA convention, but the topology is wrong under current IAC 9: the random five-digit
  value is not guaranteed to be a valid Julian date, the bottom title and location groups
  are swapped, and the top-only `AL-…` reference is repeated at the bottom. Their
  proportions are also more regular and spacious than the converted FAA pages.
- Generated graticules are visually prominent on sparse sheets because they traverse
  otherwise empty space. In the references, graticules compete with a richer field and
  therefore recede.
- The communications, field-elevation, magnetic-variation, PCN, ramp-frequency, caution,
  and notes blocks cover the basic furniture classes, but each is a simplified text
  block. Real sheets use more rows, subheadings, runway assignments, declared-distance
  markers, lighting boxes, inset callouts, and publisher-specific tables.
- Fixed portrait output only rotates mapped airport geometry for the IAC east-west case;
  it does not rotate the other inside-neatline annotations and furniture shown in IAC-9
  Appendix 7. It also does not represent the landscape and multi-panel layouts common in
  the international corpus. Australia frequently adds runway hot-spot insets and large
  lighting/notes tables; India adds full runway-marking profiles; Latvia uses a full
  marking-and-lighting panel; South Africa reserves a large characteristics table at the
  bottom.

## 8. Symbology and operational density

The current engine includes more symbols than the first glance suggests: closed runways,
blast pads, EMAS, displaced thresholds, ILS/CAT II holds, LAHSO, hotspots, tie-down marks,
and tower/beacon symbols. They occur on a thin base map, so they look like isolated special
effects. In real diagrams those symbols sit among approach lights, visual glide-slope
indicators, RVR sites, windsocks, arresting gear, stand lead-ins, stop bars, runway-guard
lights, boundaries, roads, and facility labels. Credibility comes from that supporting
system, not from increasing the frequency of any one special symbol.

## 9. International-reference differences

The current renderer deliberately targets FAA style and should not be judged as a failed
international renderer. The international charts nevertheless reveal content gaps:

- Australia and Finland draw water, coastline, roads, terrain/urban context, and detailed
  airport boundaries.
- Brazil uses strong red operational notes and, at Santos Dumont, cyan water; airport
  footprints are embedded in a geographic setting.
- India uses red/blue/yellow line systems and a separate runway-marking profile.
- Latvia and South Africa devote substantial space to declared distances, lighting,
  runway markings, and physical-characteristics tables.

The applicable discrepancy is that the engine has no content model for most of those
objects. A future FAA-only renderer can still use the common subset—roads, boundaries,
lighting equipment, stands, and contextual constraints—without adopting each publisher's
color or page template.

## 10. Priority order suggested by the visual evidence

This audit does not prescribe implementation, but the visual leverage is clear:

1. Connected, locally varied taxiway and apron topology.
2. Terminal aprons that follow terminal geometry and contain stand/taxilane structure.
3. More varied, accreted terminal and district footprints.
4. Operational ground-detail families: lights, markings, stands, roads, boundaries, and
   navigation/sensor sites.
5. Denser role-aware furniture and alternate page compositions.
6. Fine typography and line-weight tuning after the map itself carries comparable detail.
