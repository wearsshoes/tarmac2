# Real FAA airport-diagram features — commonalities and variation

Sample = the four reference SVGs: **KIXD** (New Century AirCenter, 2-runway GA/reliever),
**KTYS** (McGhee Tyson, 2 parallel runways, mid-size commercial + ANG), **MSP** (4 runways,
two terminals, large hub), **ORD** (8 runways, mega-hub). Feature counts are given as n/4.
Cross-checks against the raster references (ITH, PRC, ATL, JFK) and the IAC-9 appendix
examples are noted where they matter.

## 1. Held in 4/4 — the invariant skeleton

### Sheet & margins
- Portrait sheet, white background, one rectangular neatline border inset from all edges.
  (Landscape with north to the left exists — ATL, JFK rasters — but 0/4 of the SVG sample.)
- Top margin, left→right: 5-digit Julian revision date (small) stacked above a very large
  **AIRPORT DIAGRAM** flush left; **AL-nnn (FAA)** centered; airport name + **(ID)** flush
  right with city, state below it. Bottom-left repeats **AIRPORT DIAGRAM** with the Julian
  date below; bottom-right shows city/state above airport name + **(ID)**. The `AL-nnn`
  reference is top-only under current IAC 9.
- Vertical publication-cycle text rotated ±90° in both side margins, outside the neatline:
  `NC-1, 04 APR 2013 to 02 MAY 2013` (volume code + date window). Appears twice, once per side.
- All-caps geometric sans throughout (spec: Futura Medium; ~7 pt inside the planview,
  14 pt title). Zeros are slashed in identifiers.

### Communications block
- Upper-left inside the frame, in fixed order: ATIS (or ASOS/D-ATIS), `<NAME> TOWER` +
  frequencies (with per-runway annotations at multi-runway fields), GND CON, CLNC DEL.
  Part-time facility marked with a ★ after the title. Boxed negative-`D` icon (declared
  distances) below the block when applicable (3/4 — KIXD lacks it).

### Graticule
- Thin **solid** black lat/lon lines crossing the whole plot area, with short perpendicular
  tick marks at regular sub-intervals along them. 2–4 lines per axis; labels like `38°50'N`
  / `93°13'W` set horizontally at the line ends (right edge for lat, bottom for lon in 4/4;
  ORD also labels top). Interval is 1' or 0.5' chosen so ≥1 whole minute spans the airport.
- The airport floats in generous white space; pavement never crowds the border.

### Runways
- Solid black bars (hard surface), drawn to scale in length and width.
- Each end: runway number rotated to read along the runway looking down it, positioned at
  the threshold; `ELEV nnn` (whole feet) callout; magnetic heading to 0.1° (`230.6°`) with
  an arrow pointing along the runway near each end.
- One `nnnnn X nnn` dimension string per runway, set parallel to the runway.
- Slope annotations where ≥0.3%: `0.8% UP` / `0.3% DOWN` with directional arrow, rotated
  along the runway.
- Weight-bearing block somewhere in open white space: `RWY 05L-23R` / `PCN 71 R/B/W/T` /
  `S-120, D-239, 2D-439, 2D/2D2-961` (older charts: S/D/2S/2D only, no PCN — MSP).

### Taxiways, aprons, buildings
- Taxiways + aprons: light gray **#CFCFCF**, one flat tone, no outlines on taxiways.
  Full-length parallel taxiway alongside every active runway (both sides at bigger fields);
  connectors between parallel and runway; connector spacing tightens near thresholds.
- Taxiway labels: plain black letters (Futura, ~7 pt) sitting on/next to the pavement —
  **never boxed**. Connectors = letter+digit (`A4`, `W10`), numbered sequentially along the
  parent, largest numbers at one end. Letters repeat along the length of long taxiways.
- Buildings: solid black silhouettes. Terminal shapes are complex (piers, satellites,
  courtyards); hangars read as rows of small rectangles or striped bars.
- Generic labels only — `HANGAR`, `FBO`, `TERMINAL`, `FIRE STATION`, `CARGO RAMP`,
  `GENERAL AVIATION PARKING` — with thin straight leader lines/arrows from label to feature,
  often forked to point at several instances (`HANGARS` with 3 arrows).
- Control tower: `TWR nnnn` (site elevation) with leader to a small black shape; beacon =
  five-pointed star with open center (`TWR/BCN` when collocated).

### Hot spots
- 1–7 per chart, the **only color**: brown `#945101`/`#955101`. Each = boxed `HS 1` label
  (brown box, brown text, white fill) + brown leader line (sometimes multi-segment) + brown
  circle/ellipse around the geometry. Ellipse elongates along the feature being flagged.

### Bottom furniture
- `CAUTION: BE ALERT TO RUNWAY CROSSING CLEARANCES.` plus underlined
  `READBACK OF ALL RUNWAY HOLDING INSTRUCTIONS IS REQUIRED.` (position varies: bottom
  center 2/4, top 1/4 (ORD), lower-left 1/4).
- Magnetic-variation assembly in open white space: vertical true-north arrow + slanted
  magnetic arrow, `VAR n.n° E/W` along the slant, `JANUARY 20nn` / `ANNUAL RATE OF CHANGE
  0.1° W` beneath.
- Boxed `FIELD ELEV nnnn` (highest point on any runway), 4/4 present; position varies
  (upper-right 3/4, lower-left ORD), with leader/arrow to the high point when it fits.

### Line discipline
- Two line weights do almost everything: **0.39 pt (.005")** for graticule, leaders,
  outlines, text strokes; **0.78 pt (.010")** for the neatline. A third (0.42) appears
  rarely. Nothing heavier except runway fills. This uniformity is a huge tell of realness.

## 2. Varies airport-to-airport

| Feature | Count | Notes |
|---|---|---|
| Hatched aprons + `NON MOVEMENT AREA` legend | 1/4 (KTYS) | ATL lists a non-movement freq instead; most charts use plain gray |
| ASDE-X transponder note | 2/4 (MSP, ORD) | Big towered fields only; boxed or free text |
| LAHSO hold markers + label | 2/4 (MSP, ORD) | Paired loop symbols on pavement, `LAHSO` + arrow |
| EMAS beds | 2/4 (MSP, ORD) | Open outlined box beyond threshold + `EMAS` label |
| Blast pad / stopway chevrons | 0/4 SVGs; PRC, JFK, IAC-9 examples | Chevron-striped rectangle + `nnn X nnn BLAST PAD` |
| Displaced threshold symbol | 0/4 clearly; JFK, IAC-9 legend | Bar+arrows across runway |
| Closed runway/pavement (X marks on screen) | 1/4 (KIXD) | Gray pavement with X's, no designators |
| De-ice pads labeled | 1/4 (MSP) | Also DFW example; hub feature |
| Military tenants (`ANG`, `USAF AREA`, `MILITARY FIRE STATION`) | 2/4 (KTYS, MSP) | Own aprons, hatched at KTYS |
| Ramp frequencies table | 0/4 (ATL, IAD examples have it) | `Ramp 1 131.45 …` list in white space |
| GND METERING / CPDLC / PDC freqs | 1/4 (ORD) | Mega-hub only |
| Runway centerline-light dot pattern (negative dots in runway) | 0/4 (ATL raster, IAC-9 legend) | White dotted line inside black bar |
| Approach-light circled-letter symbols at thresholds | 2/4 (ORD faintly, KTYS none) — ATL/JFK/IAC-9 yes | Miniature symbol + circled letter |
| Boxed lighting notes (`REIL Rwy 24`, `HIRL Rwy 6-24`) | 0/4 (ITH-era & ATL have them) | Grouped box in open area |
| Sub-tower breakdown (`GND CON TOWER NORTH …`) | 1/4 (ORD) | Scales with hub size |
| Multiple terminals | 1/4 (MSP) | `TERMINAL 1` / `TERMINAL 2` naming |
| Hotspot count | 1 (KIXD) → 7 (ORD) | Scales with intersection complexity |
| Inset circle for congested area | 0/4 (IAD IAC-9 example) | Enlarged detail circle + `SEE INSET` |
| Landscape / rotated sheet | 0/4 (ATL, JFK) | For predominantly E-W layouts, north → left |
| `RUN UP PAD`, `PENALTY BOX`, `SCENIC HOLD PAD` | MSP/ORD oddities | One-off named pavements add realism |
| Elevation callouts mid-runway (`ELEV 653` at intersections) | 2/4 (ORD, MSP) | At runway crossings on big fields |

## 3. Layout truths the sample demonstrates (for generation)

- **Parallel-runway pairs dominate**: KTYS = one pair; MSP = one pair + two crossers;
  ORD = three parallel banks (093°, 043°, 143° families) + crossers being phased; KIXD =
  one primary + one closed crosser. Parallel separations are large (≥ ~1000 ft on the page).
- Runway length hierarchy: primary longest (7339–13000 ft in sample), secondaries shorter;
  GA crosser can be much shorter (5132 ft) and narrower (100 vs 150 ft).
- Terminals sit **between or beside** parallel banks, never across a runway from their
  apron; GA/cargo/military areas are pushed to peripheral quadrants, each with its own
  ramp touching a taxiway.
- Taxiway letters are assigned per system, roughly geographically (K/L flank MSP's 17-35;
  A/B south side, P/Q north side of Terminal 1); connector numbers run sequentially
  toward a threshold.
- The pavement network reads as **one connected blob** — every apron connects via gray
  pavement to some runway; no floating islands.
- White space matters: even ORD's monster footprint keeps clear margins and pushes text
  lists (PCN blocks) into corners of pure white.
