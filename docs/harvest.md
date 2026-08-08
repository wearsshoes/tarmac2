# Harvest — proven recipes to port into this engine

Distilled from a depth audit of a previous generation of this project. Everything here
is written to be implementable standalone; where a number appears, it was tuned by eye
against real charts and is worth keeping as a starting value. Items are grouped by the
build-plan phase they feed. Nothing in this file requires consulting any other codebase.

---

## H1. RNG architecture (→ Phase 1)

- **xmur3 string hash → sfc32 PRNG.** One class instance = one stream; keep the seed
  string so streams can fork.
- **`derive(label)`**: fork a stream as `new Rng(seed + "::" + label)`. Sub-streams are
  independent by construction — adding a draw in one subsystem can never desync another.
- **Warm up each stream with 12 discarded draws** so human-typed seeds differing by one
  character diverge immediately.
- Canonical stream split: `identity` (names/coords), `numbers` (chart ids, freqs),
  `layout` (geometry). Within layout, fork a **`morph` stream** for building aesthetics
  so iterating on morphology never reshuffles the field layout.
- **Per-attempt re-derive trick**: when trying N candidate placements for the same
  feature, re-derive the same labeled stream for each attempt so all candidates get
  identical downstream randomness — the final choice then depends only on geometry.
- Helpers: `float/range/int(inclusive)/pick/chance/gauss(Box-Muller)/shuffle(non-mutating)`.
- Seed format: `WORD-0000` from a ~50-word aviation vocabulary (AZURE BRAVO CIRRUS DELTA
  ECHO FALCON … VORTEX WAYPOINT ZULU) + 4-digit zero-padded number.

## H2. Fictional identity (→ Phase 2)

The consistency mechanism: each ICAO prefix letter carries a **weight and a plausible
lat/lon bounding box**; draw coordinates *from the chosen prefix's box* so ICAO letter
and graticule always agree.

| Region | Prefix (weight) | Lat box | Lon box |
|---|---|---|---|
| americas | K (.55) | 26..48 | -124..-70 |
| | C (.20) | 43..58 | -128..-60 |
| | S (.25) | -38..8 | -79..-40 |
| europe | E (.50) | 48..62 | -5..25 |
| | L (.50) | 36..48 | -9..28 |
| asia | R/V/Z/O (.25 ea) | 14..43 / 6..28 / 22..48 / 14..38 | 120..146 / 68..108 / 78..128 / 36..62 |
| oceania | Y (.60) / N (.40) | -43..-12 / -40..-15 | 113..153 / 158..179 |
| africa | D/F/G/H (.25/.30/.20/.25) | 4..18 / -33..-2 / 5..24 / -4..30 | -16..14 / 12..40 / -17..-1 / 30..48 |

- **City names**: per-region syllable pools (first + second parts, ~16–20 each), joined
  with seam de-duplication (Wick + kami → "Wickami"); optional regional city prefixes
  (americas: Port/New/Fort/Lake/… @ 40%; europe: Bad/Sankt/Nova/Ober @ 15%; oceania:
  Port/Mount/Cape @ 30%). Keep pools ≥ 20×16 per region to avoid repeats.
- **Territory pools** (8–10 invented "states" per region, e.g. NEW CASCADIA, VERMILION,
  WESTMARCH…). Improvement over the audited version: pick the territory *after* the
  prefix so it can be correlated with the coordinate box.
- **IATA derivation** from the city name: initials of every word → consonants of the last
  word → remaining letters; first 3 distinct. ICAO = prefix + 3 letters.
- **Name-style roll**: 55% `<CITY> INTL`, 20% `<CITY> RGNL`, 15% `<CITY> RGNL - <SURNAME>
  FLD`, 10% split `<SURNAME> FLD` / `<CITY> MUNI`. Per-region surname pools (6 each:
  HOLLISTER/GRANGER/… , BRANDT/KELLER/…, MASUDA/RAVANE/…, FAIRWEATHER/NGATOA/…,
  OKONNAR/DIABATE/…).
- **Magnetic variation from longitude**: per-region agonic reference longitude
  (americas -95, europe +5, asia +105, oceania +140, africa +20);
  `var = (agonic − lon) × 0.25 + gauss(0,2)`, clamp ±16, round to 0.5, never exactly 0.
- **Volume string**: hemisphere code from lat/lon (NE/NW/SE/SW, 25% override to NC/EC),
  volume number 1–4, and a **28-day effectivity window** anchored to a real AIRAC-style
  cycle date: `start = 25 JAN 2024 + k×28d`, printed `"SE-1, 20 APR 2023 to 18 MAY 2023"`.
- Field elevation synthesis when not forced: 55% lowland `int(8,350)`, else
  `350 + float()² × 5650` (long tail to ~6,000 ft).

## H3. Runway realization (→ Phase 3)

- **Numbering**: `round(magHeading/10) % 36`, 0 → 36; reciprocal = `((n+17) % 36) + 1`.
  Magnetic = true heading − variation.
- **L/C/R assignment**: group parallels by shared low number; sort members leftmost-first
  as seen by a pilot on the low-numbered approach; suffix pools [L,R] / [L,C,R]; the
  reciprocal end gets the **mirrored** suffix (09L pairs with 27R).
- **4+ parallels: chunked renumbering** — chunks of 2 (final 3 if needed), each later
  chunk's runway number incremented by 1 (the real LAX 24/25, ATL 8/9/10 pattern).
- Widths: >9,500 ft → 150; >7,000 → 150 primary / 100 secondary; else 100/75.
- Per-end elevation: `fieldElev − |gauss(0,7)|`, then force the field elevation onto the
  primary's higher end (field elev = highest point on a runway).
- End features: displaced threshold 22% chance, 200–900 ft (50-ft steps); blast pad 28%,
  200–1,000 ft (100-ft steps); EMAS (big fields only) 20%, 300–600 ft, suppresses blast
  pad. Closed runways: never the primary.
- **Bank stagger**: offset each runway in a bank along its own axis by ±15% of primary
  length — this is what makes parallel banks look built-over-decades, not stamped.
- Runway allotment across heading families: greedy weighted — each family starts with 1,
  the rest go to the family minimizing `(count+1)/weight`, primary family weight ≈ 2.2
  (≈ 1.2 for a JFK-style even split into two crossing pairs).
- Crossing-family headings: primary ± 35–85°, with a cap keeping **all pairwise axis
  differences ≥ 35°** (third family capped at `140° − firstDelta`).
- **Strength strings**, scaled by `w = length/13500`:
  - Classic: `S-{gauss(100w,15)}, D-{gauss(210w,25)}` + one of `2D-…` / `2S-…, 2D-…` /
    `2D2-{gauss(820w,80)}` (roll .35/.30/.35).
  - PCN: `PCN {gauss(92w,12)} {R|R|F}/{A|B|B|C}/{W|X}/{T|U}` + `S-, D-, 2D-, 2D/2D2-`
    (means 80w/215w/510w/880w) — weighted picks bias rigid pavement, subgrade B.

## H4. Taxiway conventions (→ Phase 4)

- **Letters assigned by descending path length** — A is always the longest parallel.
  Sequence A..Z (skip I/O/X per naming spec), then doubled letters; repair-pass links
  fall back to Z1, Z2….
- **Connector stubs `<letter><digit>`, numbered west/south → east/north** along the
  parent (canonicalize the axis direction to +x, or +y when vertical, then sort).
- Label repetition along long taxiways every 2,000–3,000 ft; first label inset **0.6 ×
  spacing** from the path start (keeps letters off runway edges); always ≥ 1 label.
- Connector stations: spread across the middle 18–82% of the runway with ±3% jitter,
  plus mandatory stubs at both thresholds. Count scales with runway length relative to
  the primary.
- **High-speed exits**: 30–45° off the runway, starting 58–68% down the runway in the
  landing direction, run length `parallelOffset / tan(angle)` so the exit lands exactly
  on the parallel taxiway; one per landing direction on ≥9,000 ft runways.
- **Connectivity repair pass** (rng-free, run after the main solver as a safety net):
  union-find over taxiways (joined if polyline distance < 40 ft), then bridge the two
  largest components with straight or **one-bend** routes (corner = go-along-first or
  go-across-first; reject corners < 60 ft from endpoints; reject routes passing < 40 ft
  from a building); iterate ≤ 24×. Also: every apron must touch the network; every open
  runway must have a taxiway within 100 ft.
- **Hotspot scoring**: runway×runway crossing = risk 3; taxiway×runway true crossing
  (intersection > 150 ft from the taxiway segment's ends) = risk 2; threshold connector
  clusters = risk 1 fallback. Sort by risk, greedily take up to N, rejecting candidates
  within 500 ft of an already-picked spot. Radius ~300 ft.

## H5. Districts & facility zoo (→ Phase 5)

**Placement machinery:**
- **Cluster-atomic placement**: a facility = aprons + buildings placed together or not
  at all (a GA ramp always brings its hangar rows and FBO).
- **Deconfliction registry** with hard margins: building→runway centerline ≥ 520 ft;
  building→reserved taxiway corridor ≥ 70 ft; apron→runway ≥ halfWidth + 100 ft;
  cluster→cluster ≥ 150 ft. Reserve parallel-taxiway corridors *before* placing any
  building.
- **Bounding-circle prefilter**: wrap every polygon with (vertex-mean centroid, radius);
  test `dist(centers) − r₁ − r₂ < margin` before any exact polygon distance. Makes
  brute-force sliding search affordable.
- **Sliding search order**: preferred side then flip; outward steps [0, 400, 900, 1600,
  2400] ft; along-axis slide 0→~12,600 ft in 700-ft steps, alternating ±. First fit wins.

**Tuned cluster recipes (all in feet):**
- GA ramp: apron half-length 450 + ga×650, depth 250 + ga×250; hangar grid rows
  1–3 × 2–6, hangars 124 wide × 105 deep at 185 along-pitch / 170 row-pitch, first row
  40 behind the apron edge; FBO 160×130 at 40–80% chance.
- Cargo: apron half 320 + ga×220, 300 deep; 1–2 buildings 140 deep, 340 behind, 420
  apart; compass-8 naming ("SOUTHWEST CARGO RAMP", fallback "CARGO").
- Fuel farm: 2×2 grid of 100×100 tanks at 140 pitch; label only once.
- Fire stations: 2–4 × 180×130, stations cycling along the field at ±0.9/0/1.8 of the
  core half-length, alternating sides; "FIRE STATION 1..n".
- Military: 25% chance at rich fields; 840×320 apron + two 240×130 buildings 360
  behind; label ANG RAMP / USAF RESERVE.
- Hold pads: 300×220 at 500 ft inward from the biggest runways' thresholds, offset past
  the parallel taxiway; labels cycle ILS HOLD / CAT 2 HOLD / PENALTY BOX, with a **5%
  "SCENIC HOLD PAD"** easter egg.
- Towers: 90×90; main tower near the core; extra 1–2 at mega fields.
- Overflow apron: 640×280, named WEST/EAST/NORTH/SOUTH RAMP by compass position.

**Terminal drawing machinery** (composes with the dimensions in `terminal-design.md`):
- Author every piece in a local **(along, cross) bar frame**; mirror the frame to reuse
  end-cap code on both ends.
- **Chord-clipped bulge** for rotundas/tip pods: circle center 0.35r behind the chord →
  ~220° of visible arc, endpoints exactly on the host face (abuts cleanly).
- **Arc band** for curved concourses: from chord half-length + sag, `R = (h² + s²)/2s`,
  emit outer/inner arcs at R ± halfWidth.
- **Notched box** for processors: landside face stepped — ends recessed ~40 ft over the
  outer ~28% margins. The subtle silhouette real chart buildings have.
- **Bar decorator**: caps ∈ {none, tee, wye, pod, rotunda}; fingers evenly spaced across
  the middle 72% of a bar, alternating sides option, center-avoidance option (clears a
  spine corridor), skip-don't-retry on collision. Clamp every decoration by the bar gap
  so parallel concourses can never touch.
- **Interpenetration test with abutment tolerance**: pieces may share faces/corners but
  not overlap — segment intersections only count if > ~1 ft from all endpoints, vertices
  only count as inside if > ~1 ft from every edge, near-parallel edge pairs skipped
  (float noise at large coordinates).
- **Horseshoe mouth-direction search**: score candidate headings every 15° by
  Σ max(0, cos(angle-to-runway-sample)) / distance over sampled runway points; open the
  ring's landside mouth toward the *minimum* (emptiest direction).
- **Outboard shift + landside-clear**: when runway banks flank the core, prefer sliding
  the terminal outboard beyond the lesser bank; verify no runway sample sits in the
  landside half-plane within ~2,500 ft (a terminal backs onto open land). Two-pass:
  strict, then relaxed.
- **Satellite pods**: polygon phase-aligned so a flat face points at the terminal;
  ~30% get **no visible connector** (tunnel-reached, like real midfield satellites);
  extend the apron to hug the pods.
- Numbered ramp aprons between concourse bars ("RAMP 1…"), labels alternating sides;
  label only every other ramp when there are > 4.

## H6. Chart-data builders (→ Phase 6)

- `fmtFreq`: 2 dp, dropping to 1 dp when the hundredths digit is 0 ("121.9", "118.35").
- Simple block (4 lines): ATIS (25% D-ATIS) 118–128.95; TOWER (30% part-time ★, 40%
  add UHF 236–299.95); GND CON 121.60–121.90; CLNC DEL 118–135.95. All on 0.05 steps.
- Sectored block: sector names NORTH/CENTER/SOUTH or WEST/CENTER/EAST chosen from the
  bank axis; runways sorted along the perpendicular and chunked per sector; each tower
  line carries its runway list `(RWY 09L-27R, …)`; 2 sectors skip CENTER. Optional split
  D-ATIS ARR/DEP (30%), dual GND CON sectors + GND METERING (60%), CPDLC/PDC "CLNC AVBL".
- Ramp frequencies: 3–8 rows at 129.00–132.95, 60% add "Snow and Ice", always end with
  "Non Movement Area" from {131.375, 129.875, 130.575}.
- **LAHSO derivation** (deterministic): for each ≥8,000 ft runway crossing another,
  hold-short point 250 ft before the crossing per landing direction; reject if landing
  distance < 4,500 ft or crossing within 1,500 ft of the far end; dedup within 800 ft;
  cap 6.
- Cautions: the two standard lines always; add "CAUTION: CLOSED RWY NOT AVBL FOR LDG OR
  DEP." when a closed runway exists.
- Chart id `int(10037, 99999)`; AL number `AL-{1..999} (FAA)`; magvar epoch
  `JANUARY {2016..2025}`.

## H7. Renderer techniques (→ Phase 7)

**Text:**
- **Halo**: page-colored stroke *under* the fill via `paint-order: stroke`, width
  0.28 × font-size, round joins. Caveat: some rasterizers ignore paint-order — verify
  with the export pipeline, or fall back to double-drawn text.
- **Two rotation rules**: labels along linear features fold into ±90° so they never read
  upside-down (`atan2` then ±180); **runway end numbers deliberately don't fold** — they
  rotate to read from final approach (`atan2(dx, −dy)`), which is FAA-correct.
- Formatters: magnetic heading `%05.1f°` ("009.5°"); coordinates `42°29.5'N` dropping
  the decimal on whole minutes; variation `"7.5°W"` from sign.
- Label wrap at ~16 chars, splitting at the word boundary nearest the middle, 2 lines max.

**Placement engine:**
- Airfield-aware whitespace packing for sheet furniture; runway and taxiway paths are
  sampled into a 6-unit occupancy grid so diagonal layouts leave their real corner
  whitespace available. Semantic corner/side candidates are ranked by clearance, with
  a grid-search fallback. See `renderer-layout.md`.
- **Tiered policy** (priority = draw order): packed furniture blocks register first;
  runway annotations **force-place** (they deposit obstacles but never yield); taxiway
  letters search expanding candidate rings and drop repeats but keep ≥1 per taxiway;
  apron labels never drop (least-overlap fallback + leader); building labels drop entirely on collision;
  hotspots/LAHSO never drop. Rotated runway annotations reserve their page-space AABB
  and search alternate stations, sides, and offsets before a least-overlap fallback.

**Tuned layout constants (page units = 1/100 inch on an 850×1100 page):**
- Offsets from runway edge: dimensions +9, closed-label +10, heading +11 (with a
  15→26-unit leader + arrowhead at 29), ELEV box +16, EMAS label +20.
- Along-runway stations: ELEV at 5.5% of length, heading at 16%, end number outside the
  threshold clearing `max(blastPad, EMAS)` + 14.
- Alternate the dimension-label side by runway index (parallels don't stack their dims);
  put ELEV opposite the heading; alternate taxiway-letter sides in a checkerboard by
  (labelIndex + taxiwayIndex) % 2.
- Font scale two-step: normal / dense (dense when px-per-foot < 0.026 or ≥ 5 runways):
  end numbers 10.5/9.5 (bold), headings 7.5/6.5, dims 8/7, ELEV 7/6.5, taxiway letters
  7/6, minor labels 7/6, blast pad 6.5/6.
- Margin grammar: title 19 bold, airport name 13 bold, city 8.5, AL number 9, chart id
  8, volume strings 8 rotated ±90 at x = 24 / pageW−24; **top/bottom stacking order
  mirrors** (chart id above title at top, below at bottom).

**Symbol construction:**
- Displaced-threshold chevrons: page-colored open polylines every 220 *feet* of model
  space, apex pushed toward the far end, plus a page-colored bar at the displacement line.
- Closed runway: page-filled bar, 1.2 outline, X's every ~70 page units built from the
  runway's own basis vectors (they rotate with the runway), "CLOSED INDEFINITELY" along it.
- Blast pads: 45°-hatched pattern fill (pattern id namespaced by airport ident), labeled
  `BLAST PAD {len} X {w}`.
- EMAS: page-filled outlined bed beyond the pad + boxed label with leader + arrowhead.
- Mag-var assembly: vertical true-north arm with **filled** head; magnetic arm rotated by
  variation with **open V** head; VAR label flipped to the side away from the magnetic
  arm; epoch + annual-rate lines beneath (derive the rate, don't hardcode).
- Tower: star glyph (10-point, inner radius 0.42) beside a bold `TWR {elev}` label with
  leader; tower elevation = field + 90–170 ft (deterministic hash).
- Hotspot: ellipse rx = max(7, r×scale), ry = 0.78 rx; boxed brown label up-and-right,
  leader to 72% of the ellipse radius, vertical side alternating by index.
- Caution block: line 0 bold, line 1 underlined, grows upward from the bottom margin.
- Freq block: two-line-per-entry classic form; compact two-column auto-shrinking form
  (font = clamp(colWidth / maxChars×0.46, 5.5, 8)) for sectored hubs, with a page-fill
  backing rect; part-time facilities get a small star.
- **Corner packing** for text blocks (strength table, ramp freqs, notes): estimate free
  space per corner from the content bounding box vs plot gaps; greedy best-fit; pin the
  strength table to bottom-right.
- Graticule: dashed interior line + solid tick bridging the frame edge; labels suppressed
  under the freq block; step chosen from the latitude span (1' / 0.5' / 0.25' targeting
  2–5 lines); longitude spacing × cos(lat).

## H8. App & IO (→ Phases 0/9)

- Never-throw params/seed sanitizer; URL-hash sharing via base64url JSON with
  `history.replaceState` (300 ms debounce, read once on mount).
- Filename-safe seed (`[^A-Za-z0-9_-] → _`); exports named `tarmac-{seed}.svg` /
  `tarmac-{seed}@{scale}x.png` at 2× and 4×.
- PNG export fixes over the audited version: fill the canvas with the page color first,
  embed the font in the SVG (base64 @font-face) so rasterization doesn't depend on
  system fonts, and return a Promise.
- Keyboard: `h` toggle controls, `r` reroll — guarded when focus is in an input or a
  modifier is held.
- Page chrome: sheet with `aspect-ratio: 850/1100`, height capped to viewport, soft
  drop shadow on a dark neutral backdrop.

## H9. Known traps (learned the hard way — avoid re-earning)

1. Glyph-blind width estimation (`chars × size × 0.46`) forces ad-hoc correction factors
   everywhere; use a small per-character width table from the start.
2. Exactly-abutting building faces produce float-noise "intersections" at large
   coordinates — bake the abutment tolerance into the overlap test from day one.
3. Vertex-mean "centroids" bias label points on arc-heavy polygons; use area centroids.
4. Silent feature drops (a cluster that doesn't fit just vanishes) make debugging
   layouts miserable — log every drop.
5. A repair pass that guarantees connectivity but may route through buildings trades one
   visual bug for another; treat forced-straight fallbacks as failures to surface.
6. Don't let renderer toggles live in the generator: if a flag only omits geometry from
   the model, the renderer can never re-show it.
