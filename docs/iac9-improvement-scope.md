# IAC 9 (6 May 2025) improvement scope

## Purpose

This is an investigation-only pass through
[`IAC-9-06MAY2025-complete.pdf`](../reference/IAC-9-06MAY2025-complete.pdf). It compares
the current `SiteModel`, generator, renderer, and generated audit sheets with the current
U.S. Government specification for Airport Diagrams. It does not propose an implementation
in this pass.

IAC 9 is a portrayal and content specification, not an airport-planning guide. The earlier
real-chart audit remains the better source for natural airport morphology; IAC 9 is the
authority for which FAA chart objects appear, how they are symbolized, and where chart
furniture belongs.

## Review coverage

The review used the PDF visually first, then used its extracted text to verify wording and
section numbers.

| PDF page | Printed page | Material reviewed |
|---:|---:|---|
| 15 | 2-1 | Normal and east-west chart orientation |
| 17–31 | 3-1–3-15 | Compilation, margins, required graphic information, operational data, communications, NAVAIDs, and lighting |
| 32 | A-1 | Airport Diagram legend and symbol grammar |
| 33–34 | A-2–A-3 | Approach-light and visual-glide-slope legends |
| 35–36 | A-4–A-5 | TPP format and margin-data placement |
| 37 | A-6 | Full Airport Diagram example |
| 38 | A-7 | Airport Diagram with congested-area inset |
| 39 | A-8 | Congested/rotated Airport Diagram example |

The words **required**, **conditional**, and **example** are kept separate below:

- **Required** means IAC 9 says the object shall or will be shown when its source data is
  present.
- **Conditional** means the feature is charted only for a particular airport class,
  published condition, or request by the responsible authority.
- **Example** means it appears in an appendix composition but the appendix explicitly does
  not represent every possible operational item.

## Executive findings

The renderer already has a recognizable FAA Airport Diagram foundation: hard-surface
runways, gray taxiway/apron pavement, generic black buildings, runway-end data, graticules,
communications, field elevation, magnetic variation, PCN-like text, hotspot brown,
LAHSO, EMAS, blast pads, and centerline-light dots. That is meaningful coverage, but it is
not yet an IAC 9 conformance profile.

The highest-value additional improvements are not more decorative objects. They are:

1. **Separate pavement identity from pavement lifecycle state.** The current single
   `closed` flag cannot distinguish an indefinitely closed runway, a runway under
   construction, a runway re-purposed as taxiway/apron, a permanently closed runway,
   removed-but-visible closed pavement, or a new runway under construction. IAC 9 assigns
   different geometry and retained data to each.
2. **Treat chart orientation as an inside-neatline layout mode.** The renderer rotates the
   mapped airfield for east-west fields while keeping communications and other interior
   furniture upright. IAC 9 requires planview text to follow the geographic depiction;
   Appendix 7 rotates the mapped annotations and furniture while its outer margin/title
   data remain page-readable.
3. **Make linear labels feature-relative.** IAC 9 requires taxiway identifiers parallel
   to their taxiways. Current taxiway labels are displaced from their route but remain
   horizontal on the page.
4. **Represent source facts instead of inferring presentation from generic flags.** Runway
   surfaces, per-end slope measurements, declared distances, lighting systems, pilot
   control, NAVAIDs, facility identities, and pavement states all need structured facts
   before their IAC symbols can be selected reliably.
5. **Add a chart-document/layout layer above `SiteModel`.** Appendix 6 requires a mapped
   inset tied to a source extent; Appendix 7 requires a rotated inner-chart mode; Chapters
   2–3 define alternate border formats and exact margin data. Those are document concepts,
   not airport objects.

Two things should explicitly **not** be added merely in the name of current FAA
completeness:

- The 6 May 2025 change removes the highest-obstacle depiction from Airport Diagrams.
  Appendix 1 still retains a generic obstruction symbol, so a safety-requested obstruction
  can remain an optional feature, but “highest obstacle” is no longer a standard FAA chart
  requirement.
- Section 3.5.2.21 excludes LOC, LOC/DME, offset localizer, and ILS components from the
  NAVAIDs that must be shown. Those objects can remain in an international publisher
  profile, but should not be part of the default IAC 9 target.

## Current coverage matrix

`Supported` means the current model and renderer can express the relevant distinction.
`Partial` means a related object exists but either its semantics or portrayal is
incomplete. `Missing` means there is no first-class representation.

| IAC 9 area | Status | Current behavior | Improvement boundary |
|---|---|---|---|
| Black chart with brown hotspots | Supported | Black/gray diagram with `#945101` hotspots | Retain; validate opacity/screen values in a named FAA theme |
| Futura-class typography | Partial | Futura with fallbacks; dense sheets shrink several operational labels | Limit reductions to cases allowed by §3.3.7 and preserve required hierarchy |
| True-north / east-west orientation | Partial | Planview rotates 90° from the primary heading | Rotate all inside-neatline labels and furniture with the depiction while preserving the specified outer margins |
| Border and margin data | Partial / incorrect | One fixed 900×1200 sheet; bottom title/location groups are reversed; `AL-…` is repeated at bottom | Add explicit chart-format profiles, valid Julian dates, top-only chart reference, and current location-identifier rules |
| Projection and graticule | Partial | Local linear feet-to-page projection with cosine-scaled longitude | Add a declared projection and guarantee two annotated lines per axis |
| Hard-surface runway | Supported | Solid black to-scale bar | Retain |
| Metal, soft, ski, ultralight runway | Missing | No surface class | Add crosshatch, dot/outline, and required labels |
| Water runway | Missing | No waterway object | Add approximate/exact location semantics and the Appendix 1 symbol |
| Geolocated helipad | Missing | No helipad object | Add circle-H lighting-area symbol; do not use it for parking |
| Runway dimensions, heading, end elevation | Supported | All three are generated and rendered | Verify threshold-to-threshold meaning and source precision |
| Runway slope | Partial | One end-to-end value and one `UP` label per runway | Store the specified per-end measurements and threshold/midpoint rule |
| Displaced threshold | Partial | Distance flag and a custom white-chevron treatment | Reconcile with the mandatory Appendix 1 symbol configuration |
| Stopway, overrun, blast pad | Partial | One `blastPad` length and shared portrayal | Separate the three semantics; show only hard-surface overruns |
| EMAS | Partial | Per-end length and open outlined bed | Generalize as a typed arresting system in approximate position |
| Arresting gear / jet barrier | Missing | No cable, direction, system name, or barrier | Add true-position, directional gear and jet-barrier symbols |
| U.S. Navy OLS | Missing | No object | Add exact-side runway placement as a military profile feature |
| Declared-distance indicator | Missing | No TORA/TODA/ASDA/LDA data or negative `D` | Add a chart-level availability indicator and structured distances |
| Runway lifecycle states | Partial / incorrect | `closed` produces an open outline with repeated Xs | Model every §3.5.2.2–3.5.2.4 state separately |
| Taxiway pavement | Supported | Hard-surface gray ribbons and fillets | Add surface and state attributes |
| Taxiway labels | Partial | Repeated, collision-aware, but page-horizontal | Rotate parallel to path; apply no-space and underline rules |
| Closed/under-construction taxiway | Missing | No route state | Screen and add Xs; suppress identifiers |
| Parking and apron areas | Partial | Multiple generic apron kinds and labels | Add authoritative generic naming and conditional hot-cargo/alert areas |
| Holding-position marking | Partial | Simplified hold bars plus ILS label on some hubs | Encode normal, non-typical, ILS, CAT, and LAHSO purpose/orientation |
| Penalty box | Missing | No object | Add mapped/labeled area when published |
| Field elevation | Partial | Box uses known field elevation but no dot/leader | Point to the known runway high point; use opposite-corner fallback only when unknown |
| Generic buildings | Partial | Terminal, hangar, FBO, cargo, fire, tower, fuel, military | Add administration/base ops, government hangar numbering, FSS/NWS, Customs, FSDO |
| Tower and beacon | Partial | Tower building always receives a beacon star and `BCN` | Separate tower, beacon, collocation, pilot-control, and on-building leader semantics |
| Hotspots | Mostly supported | Brown ellipse, leader, boxed `HS n` | Add tabulation/reason linkage; preserve the manual's spacing ambiguity explicitly |
| Run-up / arm-dearm / compass rose | Missing or schema-adjacent | `hold-pad`/military apron kinds do not express these meanings | Add distinct conditional objects and labels |
| Radar reflectors | Missing | No located object or fallback note | Add exact position plus unknown-position runway note |
| Surface surveillance | Partial | Synthetic ASDE-X note on hubs | Model ASDE-X, ASSC, and SAID from a typed source fact |
| Wind cone / landing tee / tetrahedron | Missing | No landing-direction-indicator object | Add correct unit/lit variants and proper position |
| Self-service fuel | Missing | Fuel-farm buildings are generated | Add pump symbol, collocation rule, leader, and `FUEL` label |
| Visual screen | Missing | No object | Add the striped Appendix 1 symbol in proper position |
| Runway-status-lights note | Text only | Random hub note | Derive it from a runway-status-light fact |
| Magnetic variation | Partial | Complete-looking but synthetic assembly | Store epoch and annual change rather than deriving display text from variation |
| Communications | Partial | Ordered frequency rows, part-time star, ramp table | Add service variants, primary VHF/UHF rules, airport-specific ramp applicability, and negative lighting symbols |
| Towered-airport caution | Supported in spirit | Two standard caution lines | Keep exact civil wording and placement preference |
| NAVAIDs | Missing | No located NAVAID collection | Add required in-bounds types; enforce explicit exclusions |
| Approach lighting and VGSI | Missing | No threshold-side lighting symbols | Add typed systems, side, flashers, and Appendix 2 identifiers |
| REIL/RLLS/runway-light notes | Missing | Centerline dots only | Add grouped boxed notes and `All Rwys`/exception grammar |
| Pilot-controlled lighting | Missing | No negative symbol or nonstandard activation marker | Link lighting capability to frequency and lighting-note portrayals |
| Congested-area inset | Missing | One planview only | Add source extent, callout, enlarged map, and cross-reference |
| Complete rotated inner chart | Missing | Map-only rotation | Rotate furniture, mapped labels, graticule, and map together; keep outer margin data in the Appendix 7 page orientation |
| Legend/document pages | Missing | SVG is a single chart | Add only if the product is expected to emit the full chart document set |

## Detailed discrepancy scope

### 1. Chart format, projection, and orientation

Section 2.1 defines two modes:

- normally, true north is at the top of the page;
- for a predominantly east-west field, the diagram uses the landscape convention with
  north toward the left and text oriented consistently with the depiction.

The current projection chooses its rotation from the first runway. This is a useful
heuristic, but it does not establish that the airport as a whole is predominantly
east-west, and it rotates only projected ground geometry. Communication text and other
inside-neatline furniture stay in the portrait reading direction. Appendix 7 rotates that
interior content consistently while retaining page-readable outer margin/title data.

The fixed SVG also conflates several specified product formats. Section 3.3.8 identifies
a 4.9×7.0-inch border for Military/Alaska and a 9.0×9.0-inch civil border, while Appendix
3 shows a civil LGA TPP example with a 4.9×7.0-inch neatline. A future scope should name
the target product explicitly rather than treating one 824×1056-pixel frame as universal.

Appendix 4 and §§3.4.1–3.4.6 expose several direct margin discrepancies:

- top-left is a valid `YYDDD` Julian revision date above `AIRPORT DIAGRAM`; the current
  random five-digit `chartNumber` can produce a day greater than 366;
- the chart reference number `AL-… (FAA)` is centered in the **top margin only**, while the
  renderer repeats it at the bottom;
- bottom-left is `AIRPORT DIAGRAM` with the Julian date below it;
- bottom-right is geographic location above airport name and location identifier;
- the renderer currently swaps those bottom-left/bottom-right groups;
- zeros in location identifiers require a slash, and the 6 May 2025 edition incorporates
  revised terminal-chart location-identifier rules.

The graticule is visually close, including 6-second ticks, but the projection is a local
linear transform rather than Lambert Conformal Conic, Polyconic, or Polar Stereographic.
For fictional diagrams this is a low-visibility issue; for IAC-compatible geographic data
it becomes a correctness issue. At minimum the chart should record the projection used,
guarantee two annotated latitude and longitude lines, and test geographic agreement among
features, labels, and ticks.

### 2. Runway facts and per-end annotation

The existing runway record is a strong base, but several fields combine facts that IAC 9
uses differently:

- `blastPad` currently stands in for blast pad, stopway, and overrun. IAC 9 requires only
  hard-surfaced overruns to be shown and shifts approach-light symbols to the outer end of
  chevrons.
- `slope` is a single number. For runways 8,000 feet or longer, the specified value is
  measured from each threshold to midpoint; for shorter runways it is threshold to
  threshold. Values are charted when the unrounded slope is at least 0.25 percent and are
  positioned by the corresponding runway end with `UP` or `DOWN` and an arrow.
- `centerlineLights` is a useful first lighting field, but IAC uses both the negative dot
  pattern in the runway and a separate boxed-note grammar when CL is paired with TDZL.
- `pcn` is free text. IAC 9 recognizes PCN and PCR when published; a typed capacity record
  would prevent mixing incompatible formats and would support precise chart text.
- Declared distances have no representation. The negative `D` is not the table itself; it
  indicates that runway declared-distance information is available elsewhere.

The displaced-threshold drawing should be rechecked against Appendix 1 rather than against
physical runway-paint intuition. The engine currently draws small white chevrons within the
black runway, while the IAC legend uses a specific reference symbol. The desired chart
symbol and any physical pavement marking should be separate concepts.

### 3. Pavement lifecycle and surface grammar

This is the clearest correctness gap in the current model. IAC 9 distinguishes:

1. an **indefinitely closed runway** that remains in the authoritative database and keeps
   end identifiers, headings, elevations, dimensions, and a center label;
2. a **runway under construction** that remains a runway record and keeps operationally
   relevant end data while receiving an under-construction label;
3. a **runway re-purposed as taxiway or apron**, drawn as screened pavement and identified
   by the new use;
4. a **permanently closed runway** still present in the database, drawn as an open runway
   with an X at each end and no designators, dimensions, or ordinary runway data;
5. **closed pavement** removed from the runway database, screened with repeated Xs along
   the whole or affected extent;
6. a **new runway under construction**, drawn only as a .010-inch dotted outline.

The current `closed` rendering combines the open permanently-closed outline with repeated
closed-pavement Xs. This should be treated as a semantic correction, not a style tweak.
Taxiways need equivalent segment-level state so closed or construction sections can lose
their identifiers without deleting the connected route from the map.

Surface type is another independent axis. IAC 9 distinguishes hard, metal, other-than-hard,
water, and the specifically labeled ultralight/ski cases. A lifecycle state must not be
encoded as a surface pattern, and a surface class must not determine whether the object is
operational.

### 4. Taxiways, holding positions, and apron labels

All active taxiways must be labeled parallel to their orientation. Long-label repetition
is already present, but each label needs the local tangent of the path at its station. The
identifier grammar also needs to preserve:

- no spaces or dashes in two-character identifiers such as `A2` and `B1`;
- underlining for standalone M, N, W, and Z identifiers to prevent ambiguity;
- the distinction between M, MM, and M followed by a number;
- no identifier on a closed or under-construction taxiway.

The current `HoldLine.kind` can name ILS and CAT II, but the rendered geometry does not
express the full marking family and labels ILS only for selected hub roles. IAC 9 ties
portrayal to the published marking, not airport size. Non-typical runway holding positions
are conditional and should retain their true ground orientation where space permits.

Apron names should stay generic. Current compass-based cargo and ramp labels are aligned
with that rule. Future labels should use categories such as Terminal Apron, FBO Ramp, GA
Transient, GA Tenant, Fire Base Apron, ANG, or USN and avoid invented commercial tenant
names. Hot-cargo ramps, alert areas, run-up areas, and arm/dearm areas need distinct meaning
even when their pavement fill is the same gray screen.

### 5. Facilities and located reference features

The current building enum covers the visually largest silhouettes but not the IAC facility
set. The FAA profile should be able to identify:

- Terminal/Administration and Base Operations;
- Fire Station and Control Tower;
- numbered military/government hangars with branch or agency;
- FSS, NWS, U.S. Customs, and FSDO;
- large tanks and self-service fuel;
- wind cones, landing tees, tetrahedrons, compass roses, visual screens, and radar
  reflectors.

Beacon and tower should not be one forced compound symbol. IAC 9 permits an independent
beacon, a tower/beacon collocation, a beacon or tower on a charted building with a leader,
and pilot-controlled negative symbology. The current tower building always receives both a
star and `BCN`, which invents collocation.

Likewise, a generated fuel farm is not the IAC self-service fuel-pump symbol. The fuel pump
is used only when the facility is not collocated with an FBO; a facility at a large building
or hangar is represented by a leader and `FUEL` label instead.

### 6. Operational notes and communications

The communications block has the right broad hierarchy, but it should be driven by
facility records and IAC display rules rather than role-based decoration. The full scope
includes ATIS/D-ATIS, Alaska AFIS, TOWER, GND CON, CLNC DEL, CPDLC, PDC, GND METERING,
and ramp control. Part-time ATIS, AFIS, tower, and ramp control receive a star after the
title; hours of operation are not charted. Ramp frequencies should be adjacent to the
ramps they control when possible, not just packed into arbitrary whitespace.

Pilot-activated lighting uses a negative symbol after the applicable frequency. A
nonstandard activation method uses a star on the relevant lighting note. These links
cannot be represented by the current independent string rows and generic notes.

The ASDE-X note should generalize to ASDE-X, ASSC, and SAID. `Runway Status Lights in
operation.` is a separate published-condition note. Neither should be added randomly by
hub role. IAC 9 also says operational notes should be kept to an absolute minimum; the
generic `notes: string[]` escape hatch should therefore not become the default way to
represent structured objects.

### 7. NAVAIDs, lighting, and visual approach aids

This is the largest missing symbol family. IAC 9 requires in-bounds NAVAIDs except the
explicit LOC/ILS exclusions, with identifiers when more than one of the same type is
shown. The model currently has no NAVAID collection or symbol selection.

Lighting needs two linked views of the same source facts:

- **mapped symbols**: miniature ALS layout with circled system identifier, VGSI on the
  actual runway side, and the centerline negative-dot pattern;
- **grouped boxed notes**: REIL, RLLS, HIRL, MIRL, LIRL, TDZL, and TDZ/CL, with common
  runway lists, `All Rwys`, or `All Rwys except` when appropriate.

Appendices 2 and 5 make placement part of meaning. Approach-light symbols sit beyond the
runway end (or beyond stopway/overrun chevrons), and VGSI symbols sit on the installed side.
A generic lighting note without end, side, and system identity is insufficient.

### 8. Insets and document composition

Appendix 6 uses an inset as a second rendering of a defined source area, not as a decorative
zoom circle. A future inset record needs:

- source-map extent or boundary;
- destination shape and scale;
- `SEE INSET` callout on the parent planview;
- preserved taxiway/building labels at larger scale;
- independent collision handling inside the inset;
- a relationship that prevents the parent and inset from contradicting each other.

Appendix 7 similarly requires an inner-chart rotation mode. Together these examples argue
for a `ChartDocument`/`ChartPanel` concept above the airport model. The airport remains one
source of truth; the document decides how many views, frames, legends, and margin systems
portray it.

## Manual ambiguities and cautions

### Hotspot spacing

Section 3.5.2.10.10 spells hotspot identifiers as `HS1`, `HS2`, and so on. Figures 3.12 and
3.13 and Appendix 1 visibly use `HS 1` with a space, which also matches the checked-in FAA
reference charts and the current renderer. This is an internal specification inconsistency.
The current `HS 1` should not be changed solely from the prose sentence; the intended
canonical source should be decided and recorded in a format profile.

### Border dimensions and product identity

Section 3.3.8 associates 4.9×7.0 inches with Military/Alaska and 9.0×9.0 inches with
Civil, but Appendix 3's explicitly civil LGA TPP example dimensions a 4.9×7.0-inch
neatline. This may reflect different civil publication products rather than a single
universal format. The renderer should not resolve the ambiguity by inference from airport
role; a target product/profile must select the page and border geometry.

### Obstructions

The change record removes the highest obstacles from Airport Diagrams, and obstacles no
longer appear in the §3.5.1 required graphic-information list. Appendix 1 still shows an
obstruction symbol, and §3.5.1 permits other unique safety-benefit features requested by
the responsible agency. The safe interpretation is:

- do not generate a highest obstacle by default;
- retain a generic optional obstruction object for explicitly sourced safety content or a
  non-FAA publisher profile;
- do not treat the old obstacle-table family as an IAC 9 completeness requirement.

### Airport Diagram versus Airport Sketch

The legend covers both Airport Diagrams and Airport Sketches, but the engine currently
produces only the diagram product. The scope should not silently expand to approach-course
or final-approach sketch content; IAC 9 states that Airport Diagrams are for ground-traffic
orientation and not for approach, landing, or departure operations.

## Recommended investigation backlog

### P0 — Correct existing IAC semantics

- Define an explicit FAA/IAC format profile and inside-neatline orientation mode.
- Correct the margin topology: valid Julian date, top-only `AL-…`, title/date at bottom
  left, and location/airport identity at bottom right.
- Replace the overloaded runway `closed` meaning in the specification with the six
  lifecycle portrayals listed above.
- Rotate taxiway labels along their local path tangent and apply identifier ambiguity
  rules.
- Make the known runway high point drive the field-elevation dot and leader.
- Separate runway surface from operational/lifecycle state.
- Separate threshold displacement, stopway, overrun, blast pad, and EMAS facts.
- Store runway-slope source measurements per the 8,000-foot rule.
- Preserve `HS 1` until the prose/appendix conflict is resolved deliberately.

### P1 — Complete the common civil Airport Diagram core

- Add declared-distance availability and structured per-direction distances.
- Add independent tower and beacon records, wind cones/landing-direction indicators,
  self-service fuel, large tanks, and the missing generic facility labels.
- Add closed/under-construction taxiway and pavement sections.
- Add typed surveillance and runway-status-light facts.
- Add required in-bounds NAVAIDs with exclusions.
- Add approach-light, VGSI, REIL, runway-light, and pilot-control records and symbols.
- Link ramp-control frequencies to the ramps to which they apply.

### P2 — Add density management as a document feature

- Add congested-area insets with source/destination relationships.
- Add complete inside-neatline rotation, including mapped labels and furniture, while
  preserving the Appendix 7 outer-margin orientation.
- Add alternate border/page profiles instead of scaling one fixed SVG.
- Add grouped lighting-note layout and `All Rwys`/exception grammar.
- Add structured hotspot tabulation/reason text rather than leaving `reason` unused.

### P3 — Add conditional and special-use features

- Waterways, geolocated helipads, metal and soft surfaces, ski/ultralight areas.
- Arresting gear, jet barriers, U.S. Navy OLS, hot-cargo ramps, arm/dearm areas.
- Penalty boxes, radar reflectors, compass roses, visual screens, and government-hangar
  numbering.
- Non-movement, restricted, under-construction, and alert-area polygons with their IAC
  screen/hatch grammar.

### P4 — Product/document completeness, only if required

- Emit a corresponding Airport Diagram legend and lighting legend.
- Support multi-page airport chart documents and continuation references.
- Validate exact physical trim, border, type size, and line weight for a chosen publication
  product.

## Acceptance scenarios for a future implementation pass

These scenarios are deliberately based on the specification's examples rather than on a
particular real airport:

1. **Appendix 5 core sheet:** crossing active runways, one soft/closed/construction case,
   runway-end data, ILS/LAHSO, generic facilities, surveillance notes, lighting notes, and
   proper field-elevation linkage.
2. **Appendix 6 dense hub:** four-runway planview with a terminal-area inset; parent and
   inset share exactly the same taxiway/building source geometry.
3. **Appendix 7 east-west hub:** north points left; mapped labels and inside-neatline
   furniture share the rotated reading direction; outer margin/title data retain the
   page-readable Appendix 7 orientation.
4. **Lifecycle strip:** one example of each runway/pavement state in §§3.5.2.2–3.5.2.4,
   proving which data is retained or suppressed.
5. **Lighting strip:** each Appendix 2 approach/VGSI family plus REIL, RLLS, runway-light,
   centerline-dot, and pilot-control note forms.
6. **Surface strip:** hard, metal, soft, ultralight, ski, water, and helipad symbols with no
   ambiguity between surface and closure state.

The important validation is semantic as well as visual: each test should assert that an
object's source category selects the correct portrayal and that a portrayal cannot be
produced from an incompatible state.

## Relationship to the earlier audit documents

This pass narrows several earlier corpus observations:

- [`rendering-discrepancies.md`](rendering-discrepancies.md) remains the visual comparison
  against actual publishers.
- [`ungenerated-ground-features.md`](ungenerated-ground-features.md) remains the broad
  real-world feature inventory, including non-FAA context.
- [`unaddressed-diagram-objects.md`](unaddressed-diagram-objects.md) remains the model-gap
  inventory, but LOC/ILS components, obstacle tables, and highest-obstacle depiction are
  now explicitly marked as non-default for the current FAA profile.
- [`spec.md`](spec.md) has been corrected where field-elevation and closed-pavement wording
  could allow a portrayal that conflicts with IAC 9.
- [`edit-plan.md`](edit-plan.md) is now the single active implementation backlog;
  [`test-suite-spec.md`](test-suite-spec.md) turns the acceptance scenarios above into a
  layered verification design.
- AC 150/5370-10H adds material, physical-lifecycle, marking-installation, and located-
  asset semantics, but it does not change this document's portrayal conclusions. IAC 9
  remains the controlling source for FAA Airport Diagram content and symbology.
