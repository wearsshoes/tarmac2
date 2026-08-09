# TARMAC spec — synthetic FAA airport diagrams

Success criterion: a single generated sheet reads as real to someone who knows FAA airport
diagrams. Two layers: **the airport** (a plausible field generated from constraints) and
**the chart** (an IAC-9-conformant rendering of it). Sources: IAC-9 (6 May 2025),
AC 150/5300-13B, AC 150/5325-4B, AC 150/5360-13A, EB 89A, and survey of real diagrams
(KIXD, KTYS, MSP, ORD, + ITH/PRC/ATL/JFK/IAD/DFW).

---

## Part A — The airport (generation constraints)

Generate from causes, not knobs. The causal chain: **region → wind + parcel + traffic role
→ runways → taxiways → aprons/buildings → chart annotations.** Every downstream fact is
derived, so everything on the sheet stays mutually consistent.

### A1. Site seed
- Fictional identity: city, state/territory, airport name, location ID; lat/lon, field
  elevation, magnetic variation — mutually consistent (var sign follows longitude,
  elevation informs runway lengths: longer when high/hot).
- **Traffic role** drives everything sizeable. Pick one: basic GA / business GA +
  reliever / regional commercial / mid-hub / major hub / mega hub. Role implies the
  design codes (AAC-ADG-TDG) and visibility minimums: GA ≈ B-II visual, TDG 2A;
  regional ≈ C-III, TDG 3; hub ≈ D-V precision, TDG 5.
- **Prevailing wind axis** (one primary direction, optional secondary component).
- **Parcel**: a convex-ish boundary polygon sized to role (GA ≈ few hundred acres;
  constrained urban ≈ 900; greenfield hub ≈ 10,000+). Optionally one or two terrain/
  city edge constraints (a clipped corner, a river edge) that visibly shape the layout.

### A2. Runways
- Primary runway heading = prevailing wind axis (rounded to a real magnetic number;
  ends differ by 18; L/C/R for parallels).
- Length by role + elevation/heat: GA 2,500–5,000 ft; business GA 5,000–7,000;
  commercial 7,000–10,000; hub primaries 9,000–13,500. Width 60/75/100/150 ft per code.
  A capacity parallel matches the primary's class; a reliever/GA parallel is shorter
  and narrower.
- Additional runways, in order of realism: (1) **parallel bank** at a standard
  separation — 700 ft (VFR pair), 2,500 ft (dependent IFR, staggered thresholds
  common), 3,100+ ft (independent IFR), ~5,000 ft (terminal sits between); (2) one
  **crosswind runway** when role is GA or region is windy — angled roughly against the
  secondary wind, shorter, pushed toward the field edge, crossing (if at all) outside
  the primaries' middle thirds; (3) at old/legacy fields, a **closed** former crosser
  (X's, screened pavement).
- Mega hubs: 2–3 parallel *banks* in up to 2 heading families (ORD/DFW pattern),
  outboard runways farthest from the core.
- Each end: threshold elevation (whole ft; field elev = highest); optional displaced
  threshold, blast pad (chevrons), or EMAS at the constrained ends; slope ≥0.3% charted.
- Everything (runways + their protection zones) must fit inside the parcel; RPZs
  (trapezoids off each end, up to 2,500 × 1,000/1,750 ft for precision ends) stay
  building-free.

### A3. Taxiways
- **Every active runway gets a full-length parallel taxiway** on its traffic side
  (both sides where districts flank it), at 150–240 ft (GA) to 400–500 ft (hub) from
  the runway CL. Busy fields add a **second (dual) parallel** between runway and
  terminal apron.
- Widths 25/35/50/75 ft by TDG. **All junctions filleted** — no square corners
  anywhere; wide flared throats where connectors meet runways.
- Connectors: right-angle stubs at each runway end (entrance = two 90° turns), 1–3
  mid-field right-angle crossings (avoiding the middle third where possible), and on
  air-carrier runways 1–3 **high-speed exits at 30°** with ~1,500 ft centerline
  radius, curving into the nearest parallel in the landing direction.
- The parallel taxiway **jogs 50–100 ft outward within ~1,500 ft of each threshold**
  (reverse curves) making room for holding bays; busy ends get a bypass stub or
  multi-slot holding bay + no-taxi island.
- Naming: parallels/long routes = single letters (no I, O, X), progressing across the
  field; connectors = parent letter + number sequential from one end (A1…A7); the
  other parallel gets its own letter; avoid runway-number collisions; hold lines at
  125–280 ft from runway CL.
- Network must be a single connected component reaching every apron and runway.

### A4. Districts, aprons, buildings
- Partition the perimeter (space between runways and parcel edge) into **districts**:
  terminal core (central, minimum taxi distance, never in an RPZ), GA ramp + FBO row,
  cargo campus (apart from terminal), military/ANG area (some fields), fuel farm,
  fire stations (1 at GA fields, 2–4 spread mid-field at hubs), remote/RON apron and
  deice pads at hubs, run-up pads near GA runway ends.
- **Terminal morphology** by role — this is the showpiece; silhouettes must be
  intricate. (`terminal-design.md` is the authoritative reference: configuration
  taxonomy, footprint dimensions, growth patterns, named real silhouettes.)
  - GA: none (hangar rows only).
  - Regional: linear slab, maybe one pier (Y/T shapes).
  - Mid-hub: pier terminal, 2–4 concourses, or two unit terminals.
  - Major/mega: pick among pier ensemble (ORD core), parallel linear concourse ranks
    (ATL), midfield satellites between 5,000-ft parallels (IAD/DEN), horseshoe of unit
    terminals around a loop (JFK), semicircular linears (DFW). Compose from parts:
    processor mass + concourses (straight/L/T/Y) + satellite bars + courtyards; add
    irregular notches — real silhouettes are messy.
- Terminal apron hugs the building outline (gate depth ≈ 200–300 ft of gray around
  concourses), then apron taxilanes; apron edges meet taxiways at discrete staggered
  throats, never a full-width bleed.
- Hangar grammar: T-hangar rows (long striped bars), box hangars (small squares),
  wide-body maintenance hangars at hubs (large rectangles near cargo). Tie-down grids
  on GA aprons (rows of small marks). Tower: near the core with sightlines, drawn as a
  small black shape + star when beaconed.
- Buildings behind the BRL: setbacks grow with building size; nothing in RPZs or
  between hold lines and runways.

### A5. Operational data (derived, chart-facing)
- Frequencies scale with role: GA = CTAF/UNICOM (+ASOS); towered = ATIS, TOWER,
  GND CON, CLNC DEL; hubs add D-ATIS, per-runway tower/ground sectors
  (`TOWER NORTH 123.4 (RWY 09L-27R)`), GND METERING, CPDLC/PDC, ramp-frequency table.
- Hot spots at genuinely confusable geometry: runway-runway crossings, short
  parallel-connector clusters at thresholds, apron throats crossing a runway approach.
  Count 1–2 (small) to 4–7 (hub).
- Per-runway PCN/strength strings sized to runway class. ASDE-X note, LAHSO markers,
  lighting notes, ILS HOLD / CAT 2 HOLD marks — hubs and precision runways only.

---

## Part B — The chart (rendering spec)

### B1. Sheet
- Portrait page, white; single neatline border **0.010″** (≈0.78 pt at chart scale);
  planview inside. If the field is predominantly east-west, rotate the sheet
  (landscape convention, north to the left, with mapped text and inside-neatline
  furniture oriented consistently; outer margin/title data remain page-readable as in
  IAC-9 Appendix 7).
- Margins (Futura Medium; all caps): top-left valid `YYDDD` Julian revision date above
  **AIRPORT DIAGRAM** (14 pt); top-center `AL-nnn (FAA)`; top-right airport name +
  `(ID)` (9 pt, ID in Century-Expanded-style caps) over city, state (8 pt). Bottom-left
  repeats **AIRPORT DIAGRAM** with the Julian date below; bottom-right places city/state
  above airport name + `(ID)`. The `AL-nnn (FAA)` reference appears in the top margin
  only. Rotated
  volume/date strings (`SE-1, 20 APR 2023 to 18 MAY 2023`) outside both side neatlines.
- Scale chosen so ≥1 whole minute of latitude fits; the field occupies the middle
  ~50–60% with deliberate white space; text blocks live in the empty quadrants.

### B2. Ink discipline
- Two colors only: black + **hotspot brown #945101**. Pavement screen gray **#CFCFCF**.
- Two working line weights: **0.005″ (0.39 pt)** for everything thin (graticule,
  ticks, leaders, outlines, boxes) and 0.010″ for the neatline. Runways are filled
  shapes, not strokes.
- Type: Futura-Medium-class geometric sans, all caps, **7 pt** in the planview;
  white halo where text crosses linework. Slashed zeros in identifiers. No bold for
  emphasis — size does that work.
- **No boxes around taxiway letters, runway-end ELEVs, or graticule labels.** Boxed
  items are exactly: `FIELD ELEV`, `HS n`, lighting notes (`REIL Rwy 24`), `D`
  (negative), ramp-frequency table (underlined heading), and inset callouts.

### B3. Graticule
- Thin solid black lat/lon lines at 30″ or 1′ intervals with short perpendicular
  ticks (30-second ticks 0.10″ long, 6-second ticks 0.04″); ≥2 lines each axis,
  labeled `35°49'N` / `84°00'W` horizontally at line ends; lines pass under pavement.

### B4. Airfield symbology (IAC-9)
- **Runways**: solid black to-scale bars. Per end: designator rotated to read along
  the runway from approach; `ELEV nnn`; magnetic heading to 0.1° with along-runway
  arrow. One `nnnnn X nnn` dimension per runway. Slope `0.n% UP/DOWN` + arrow where
  ≥0.3%. Centerline-light runways get a white dotted line inside the bar. Displaced
  thresholds per legend symbol; blast pads/stopways = chevronned rectangles over
  taxiway-gray; EMAS = open outlined box + label; arresting gear = per legend.
  Permanently closed runway = open outline + one X at each end, with no designators or
  runway data; pavement removed from the runway database but still physically present =
  screened pavement + repeated X's along the affected extent. Indefinitely closed,
  under-construction, re-purposed, and new-under-construction runways are separate states
  with the distinct IAC-9 portrayals in §§3.5.2.2–3.5.2.4.
- **Taxiways/aprons**: one flat #CFCFCF; taxiway letters plain black type set along
  the pavement, repeating along long taxiways; connector labels near their stub.
  Non-movement areas may be hatched (diagonal lines) with a legend box.
- **Buildings**: solid black silhouettes. Labels generic (`TERMINAL`, `HANGAR`, `FBO`,
  `CARGO RAMP`, `GENERAL AVIATION PARKING`, `FIRE STATION`, `FUEL FARM`, `ANG`),
  with thin straight leaders — forked when one label serves several shapes. `TWR nnnn`
  with leader; beacon = open-center five-point star; `TWR/BCN` when collocated.
- **Hot spots**: brown #945101 — boxed `HS n` label, leader (multi-segment allowed),
  circle/ellipse elongated along the flagged geometry, drawn above all black ink.
- **Holding/ops marks**: `ILS HOLD`, `CAT 2 HOLD`, LAHSO paired-loop symbols with
  `LAHSO` label + arrow, run-up pads, penalty box, no-taxi island — all labeled in
  plain type.
- **Approach lighting**: miniature symbol + circled letter at equipped thresholds
  (per IAC-9 Appendix 2); VGSI symbol on its actual side.

### B5. Furniture placement
- Comm block: upper-left (or upper-right), facility names + frequencies in fixed
  order (ATIS/D-ATIS → TOWER → GND CON → CLNC DEL → CPDLC/PDC → GND METERING), ★ on
  part-time facilities, boxed `D` beneath when declared distances exist.
- `FIELD ELEV nnnn` boxed near the known highest point on a usable runway, with a
  .03-inch dot and leader. Place the unleadered box opposite the comm block only when the
  runway high point cannot be determined.
- Mag-var assembly in open space: true-north arrow + slanted magnetic arrow,
  `VAR n.n° W` along the slant, `JANUARY 20nn` / `ANNUAL RATE OF CHANGE 0.1° W`.
- Caution lines bottom (`CAUTION: BE ALERT TO RUNWAY CROSSING CLEARANCES.` +
  underlined readback line); PCN/strength block and lighting-note boxes in white
  space; ramp-frequency table (hubs); ASDE-X note as free text in a clear area.
- **Zero label collisions.** Every string sits in clear space or on a halo; leaders
  bridge the gap when a label can't sit adjacent. Density of annotation is part of
  the aesthetic — busy but never overlapping.

### B6. Texture menu (sprinkle by role, never all at once)
Non-movement hatching + legend; `SEE INSET` circle with enlarged congested-area inset;
mid-runway intersection ELEVs; de-ice pads with leaders; `RUN UP PAD`; `SCENIC HOLD
PAD`-style one-off names; military `USAF/ANG AREA n`; `EMAS`; `NO-TAXI ISLAND`;
Ramp Frequencies table; `Runway Status Lights in operation.` note; helipad circle-H;
wind cone/tetrahedron symbol; radar-reflector note. Each extra feature should be
justified by the airport's role and era.
