# Airport Layout Design Principles for Synthetic FAA-Style Diagram Generation

**Sources used and their proper roles:**

1. **[MWAA Airports Authority Design Manual](https://www.mwaa.com/business/airports-authority-design-manual)** and the linked **Design Manual 2020** (414 pp). The manual is the governing policy and design-criteria framework for DCA and IAD. It defers AOA pavement geometry to current FAA criteria, but it adds important causal constraints: Master Plans and ALPs, Sub-Area Plans, development envelopes, setbacks, utility corridors, historic resources, operational continuity, landside systems, perimeter access, drainage, and site-specific facility relationships.
2. **[FAA Airport Construction Standards](https://www.faa.gov/airports/engineering/construction_standards)** and **AC 150/5370-10H, Standard Specifications for Construction of Airports**. This is a materials, workmanship, installation, removal, and acceptance source. It supports a richer physical-state model for pavement, markings, fences, drainage, wind cones, and lighting, but it does **not** replace the airport-layout, terminal-planning, marking-design, or visual-aid-design ACs.
3. **AC 150/5300-13B Chg 1 (w/ errata), Airport Design** (2022/2024, 413 pp) — the primary airfield geometric source.
4. **AC 150/5325-4B, Runway Length Requirements for Airport Design** (2005).
5. **AC 150/5360-13A, Airport Terminal Planning** (2018) — terminal concepts and passenger/aircraft/vehicle processing relationships.
6. **FAA Engineering Brief 89A, Taxiway Nomenclature Convention** (2022) — taxiway naming.

Source-domain rule: use design and planning publications to determine **what and where**;
use construction specifications to determine **what it is made of and what physical work
or lifecycle state exists**; use IAC 9 and checked FAA charts to determine **whether and
how it appears on the Airport Diagram**.

## 1. The classification system that drives everything (AC 13B §1.6)

Nearly every dimension below is indexed by a three-part **Runway Design Code (RDC): AAC – ADG – visibility**. A generator should pick these first; they correlate strongly with airport size.

- **Aircraft Approach Category (AAC)** — approach speed: A <91 kt; B 91–120 kt; C 121–140 kt; D 141–165 kt; E ≥166 kt. Small GA = A/B; airline jets = C/D.
- **Airplane Design Group (ADG)** — wingspan (or tail height): I <49 ft; II 49–78 ft; III 79–117 ft (737/A320); IV 118–170 ft (757/767); V 171–213 ft (747/777/787); VI 214–261 ft (A380).
- **Taxiway Design Group (TDG)** — landing-gear geometry: 1A/1B, 2A/2B, 3, 4, 5, 6. Drives taxiway width and fillet size.
- Visibility minimums: Visual / ≥1 mile / ≥¾ mile / <¾ mile (precision). Lower visibility ⇒ bigger protection surfaces.

Typical pairings: small GA field ≈ B-II-visual, TDG 1B/2A; regional airport ≈ C-III-2400, TDG 3; large hub ≈ D-V-1200, TDG 5.

## 2. Wind and runway orientation (AC 13B §3.4.3, App B)

- **Primary runway aligns with prevailing wind.** Target: crosswind component within limits **95% of the time**.
- **Allowable crosswind by RDC (Table B-1):** A-I/B-I 10.5 kt; A-II/B-II 13 kt; A-III/B-III/C-I–D-III 16 kt; ADG IV–VI (C/D) and all E 20 kt. Crosswind = wind speed × sin(angle from runway).
- **Crosswind runway logic:** if the primary orientation gives <95% coverage for the critical aircraft, add a crosswind runway roughly perpendicular to the prevailing wind. Small-aircraft airports need crosswind runways more often (lower limit). Its **length = what the lower-crosswind-capable fleet needs** — typically shorter than the primary.
- Runway numbers = magnetic heading / 10; parallels get L/C/R suffixes.

## 3. Runway dimensions and protection surfaces (AC 13B App G)

Key values by class (visual/≥1-mile minimums; <¾-mile precision value in parens where different):

| Item | A/B-I small | A/B-II | A/B-III | C/D-II | C/D-III | C/D-IV | C/D-V–VI |
|---|---|---|---|---|---|---|---|
| Runway width | 60 (75) ft | 75 (100) ft | 100 ft | 100 ft | 100 ft¹ | 150 ft | 150 ft |
| RSA length beyond end | 240 (600) ft | 300 (600) ft | 600 ft | 1,000 ft | 1,000 ft | 1,000 ft | 1,000 ft |
| Runway CL → hold line | 125 (175) ft | 200 (250) ft | 200 (250) ft | 250 ft | 250 ft | 250 ft | 250–280 ft |
| Runway CL → parallel taxiway CL | 150 (200) ft | 240 (300) ft | 300 (350) ft | 300 (400) ft | 400 ft | 400 ft | 400–500 ft |

¹ A footnote raises some C/D-III to 150 ft.

- **Runway Protection Zone (RPZ)** — building-free trapezoid on the extended centerline starting 200 ft beyond the end: A/B visual 1,000 × 250/450 ft; C/D/E visual 1,700 × 500/1,010 ft; precision (<¾ mi), all classes **2,500 × 1,000/1,750 ft**. Terminals and hangars never sit in an RPZ.
- **Blast pads** beyond ends: width = runway + ~20–70 ft; length 60–400 ft growing with class.
- Parked aircraft must stay outside the ROFA/OFZ — this sets the minimum runway-to-apron distance.

## 4. Runway length drivers (AC 5325-4B)

Length follows critical aircraft + **elevation + hottest-month temperature**, not the RDC tables. Usable generative anchors: basic GA 2,500–4,000 ft; business-jet GA 5,000–7,000 ft; commercial service 7,000–10,000 ft; large-hub primaries 9,000–13,000+ ft (longer at high/hot fields). A capacity parallel = 100% of primary length; a GA/commuter reliever parallel may be shorter.

## 5. Parallel runway separation (AC 13B §3.9)

Centerline-to-centerline minimums — these produce the characteristic spacing families:

- **700 ft** — simultaneous independent VFR ops.
- **1,200 ft** — recommended minimum for ADG V/VI pairs.
- **2,500 ft** — simultaneous IFR departures / mixed radar ops (stagger adjusts ±100 ft per 500 ft, floor 1,000 ft).
- **3,100–3,200 ft** — simultaneous independent IFR approaches.
- **~5,000 ft** — recommended when a **passenger terminal sits between the parallels** (classic midfield-hub layout).

## 6. Taxiway system design (AC 13B ch. 4)

**Widths by TDG:** 1A/1B 25 ft; 2A/2B 35 ft; 3/4 50 ft; 5/6 75 ft (+10–30 ft shoulders).

**Separations by ADG:** taxiway CL → parallel taxiway CL: 70 / 101.5 / 144.5 / 207 / 249.5 / 298.5 ft (ADG I→VI); taxiway CL → object: 44.5 / 62 / 85.5 / 121.5 / 142.5 / 167.5 ft.

**Parallel taxiways (§4.6):**
- Standard for any runway with <1-mile minimums; recommended for any instrument runway. GA fields without one substitute **turnarounds/holding bays at runway ends**.
- Recommended **50–100 ft outward jog of the parallel within 1,500 ft of the runway end** (reverse curves) — the threshold "dogleg" visible on modern charts.
- Busy airports: **dual parallels** (inner + outer), not necessarily full length.

**Runway/taxiway intersections (§4.8):**
- Default is the **right-angle connector** (±15°). Entrance taxiways at ends = two standard 90° turns with curved outer edge.
- **Keep crossings out of the middle third** of the runway; minimize crossings.
- **High-speed exits: 30° angle, 1,500-ft centerline radius**, into the nearest parallel; placed in the 4,500–7,500 ft zone on air-carrier runways, oriented with the landing direction; typically 1–3 per direction plus right-angle exits near ends.
- **Bypass stubs with no-taxi islands, or multi-slot holding bays**, at busy runway ends.
- **Crossover taxiways** connect dual parallels.

**Fillets (§4.7):** every junction gets fillet pavement (centerline radius + lead-in tapers sized per TDG, corner radii up to 30 ft). Junctions are never square — they flare.

## 7. Taxiway naming (EB 89A)

- Long/parallel taxiways: single letters A, B, C… progressing logically across the field; **I, O, X never used**.
- Connectors: **parent letter + number, sequential from one runway end to the other** (A1…A7). Number never precedes the letter. The opposite-side parallel gets its own letter and sequence.
- Avoid combos confusable with runway numbers (no "L4" with a runway 4L); double letters (AA) only after singles exhausted.
- Hold lines at the App-G hold distance (125–280 ft from runway CL).

## 8. Aprons and terminal siting (AC 13B ch. 5)

- Apron kinds worth drawing: terminal apron, GA apron, cargo apron (separated from terminal), remote/RON apron, hangar aprons, deice pads, run-up pads.
- **High-activity aprons sit centrally** (mid-field along the runway system) to minimize taxi distance and runway crossings — never in an RPZ, never across a runway from their traffic.
- Terminal face setback ≈ runway→taxiway separation + object clearances ⇒ roughly 500–1,000+ ft from the primary for ADG III–V.
- **No direct apron-to-runway throat**: apron exits force a right-angle turn onto a taxiway and are staggered relative to runway connectors. Aprons don't bleed into taxiways.
- Gate front organization: building face → GSE area → nose-in parking envelopes → push-back zone → apron taxilane(s) (+ service road).
- Segregate commercial from GA; cargo aprons get their own campus with truck-dock frontage.

## 9. Terminal building concepts (AC 5360-13A §6.5)

- **Linear** — long building, gates along the airside face; small O&D airports.
- **Pier** — concourses project from the processor, gates both sides (LGA, MIA, IAH).
- **Satellite** — detached concourses reached by tunnel/APM, often **midfield between ~5,000-ft-spaced parallels** (ATL, DEN, IAD).
- **Remote/transporter** — open-apron parking + buses; rare.
- Processors may be centralized (one terminal) or decentralized (unit terminals: JFK, LAX pattern). Hybrids are common.

## 10. Landside vs airside; building restriction lines (AC 13B §6.7; MWAA DM)

- Canonical layering: **runway → parallel taxiway(s) → apron → terminal/hangar line → landside (curb/parking/roads)**. The terminal is the airside/landside membrane.
- **BRL:** buildings sit behind a line protecting OFZs, the runway visibility zone, NAVAID critical areas, tower sight lines, and RPZs — typically set so a 25–35 ft building clears the 7:1 Part-77 transitional surface (taller ⇒ farther back).
- Parcel bounds from MWAA: **DCA = 860 acres** (land-constrained: one pier terminal, short crosswinds) vs **IAD = 11,500 acres** (greenfield: widely separated parallels, midfield concourses, cargo campus). Good bounds for "constrained urban" vs "greenfield hub" generation modes.
- Tower needs line of sight to all movement areas.

## 11. General aviation specifics (AC 13B App E)

- GA apron = tie-down rows fronting taxilanes; parking footprint ≈ (wingspan + 10 ft) × (length + 5 ft) (~59 × 35 ft for a small single).
- Segregate ADG I from ADG II+ parking; T-hangar rows and box hangars each get exclusive apron frontage.
- Typical small-GA field: single 60–75 ft × 3,000–5,000 ft runway, one 25-ft parallel taxiway at 150–240 ft separation, a few 90° connectors, tie-down grid + hangar rows on one side.

## 12. Quick generative contrast

| Parameter | Small GA (B-II, TDG 2A) | Large hub (D-V, TDG 5) |
|---|---|---|
| Runways | 1 (+crosswind in windy regions), 60–75 × 3,000–5,000 ft | 2–4 parallels + optional crosser, 150 × 9,000–13,000 ft |
| Parallel spacing | n/a | 2,500 / 3,100+ / ~5,000 ft (terminal between) |
| Runway→taxiway CL | 150–240 ft | 400–500 ft |
| Taxiway width | 25–35 ft | 75 ft |
| Connectors | 2–4 right-angle stubs | end connectors + 30° high-speed exits, dual parallels, crossovers, holding bays |
| Apron | tie-down grid + hangars, one side | midfield terminal apron, cargo campus, RON, deice pads |
| RPZ per end | 1,000 × 250/450 ft | 2,500 × 1,000/1,750 ft |

## 13. What the MWAA review adds to the site model

MWAA does not supply a new generic terminal outline formula. It does show why an airport
cannot be generated as runways plus leftover buildings:

- The approved Master Plan, ALP, and ALUP govern long-range development. Sub-Area Plans
  further divide cargo, airport/airline support, rental-car, and similar districts and
  define development envelopes, setbacks, and utility corridors. A future generator
  should therefore keep an explicit `SitePlan` or equivalent containing constrained
  areas, planned districts, access corridors, and expansion reserves.
- Compatibility is both operational and architectural. New facilities must preserve
  safe movement and avoid aviation interference, but at a developed airport their scale,
  proportions, sight lines, historic resources, and relationship to the existing campus
  also matter. Layout variation should come from an airport era and inherited phases,
  not arbitrary polygon noise.
- Constructability reviews must preserve the active airport: AOA access, passenger
  check-in, security screening, departures and arrivals, utilities, pedestrian and
  vehicular access, and the movement of baggage, cargo, mail, goods, and supplies. These
  are useful generation graphs even though most are not drawn directly on an FAA Airport
  Diagram.
- DCA and IAD demonstrate two useful site regimes. DCA is an approximately 860-acre,
  historically and geographically constrained airport with an integrated landside
  transit context. IAD is approximately 11,500 acres and contains a main terminal,
  midfield concourses and parking aprons, cargo/support districts, roads, garages, and
  rail infrastructure. These are anchors for constrained-urban and greenfield-hub modes,
  not templates to reproduce literally.
- MWAA identifies terminal entities at the facility level—DCA Terminal A and Terminal
  B & C; IAD Main Terminal and Concourses A, B, and C/D. That hierarchy supports stable
  terminal/concourse identity, but it is not evidence that every labeled entity should
  be counted as a separate terminal building in a generated chart.

## 14. What AC 150/5370-10H adds to the physical model

The construction standard makes several distinctions that the current `SiteModel`
collapses:

1. **Material is not function.** P-401 asphalt, P-403 asphalt for smaller or non-full-
   loading uses, P-404 fuel-resistant surface course, and P-501 cement concrete can all
   occur within an airport. A fuel-resistant pavement does not by itself identify a fuel
   farm, and an apron function does not uniquely imply a material.
2. **Material is not chart portrayal.** Current FAA Airport Diagrams normally screen
   taxiways and aprons with one pavement gray. Asphalt/concrete texture or color should
   appear only when the selected publisher profile calls for it.
3. **Physical lifecycle is segment-level.** P-101 separately addresses preparation,
   removal, repair, overlay, and remarking while protecting adjacent pavement, utilities,
   drainage, and base material that remain. A runway-wide `closed` boolean cannot express
   removed sections, pavement remaining in place, phased replacement, or a temporary
   connection.
4. **Markings are their own installed layer.** P-620 covers preparation and application
   of markings on runways, taxiways, and aprons, including temporary markings and removal.
   Marking layout still comes from AC 150/5340-1 and the project plans. The data model
   should not infer marking geometry merely because pavement exists.
5. **Aggregate-turf is a real surface class.** P-217 permits aggregate-turf for certain
   GA runways, taxiways, and adjacent shoulders serving ADG I and II aircraft. Grass,
   turf-reinforced, aggregate-turf, gravel, asphalt, and concrete need distinct physical
   semantics even when a particular chart profile simplifies their display.
6. **Fences, drainage, wind cones, lights, and signs are independent assets.** F-162,
   the D-series drainage items, L-107, and L-125 describe located systems assembled from
   plans. They justify first-class site objects and relationships, not unconditional
   visual clutter on every FAA chart.

The required state decomposition for the next code pass is therefore:

`surface function × material × physical lifecycle × operational availability × marking
state × publisher portrayal`.

Each axis must be queryable independently. For example, a physically present asphalt
runway segment can be operationally closed, carry removed or temporary markings, and be
portrayed as screened pavement with closure marks under IAC 9.
