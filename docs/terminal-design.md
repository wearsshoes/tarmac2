# Passenger Terminal Design Reference
## Real-world geometry for generating FAA-style airport-diagram terminal complexes

**Sourcing convention used throughout:**
- **[AC 5360-13A]** = FAA AC 150/5360-13A, *Airport Terminal Planning* (2018) — verified against the document text
- **[AC 5300-13B]** = FAA AC 150/5300-13B Chg 1, *Airport Design* (2024), esp. Table 4-1 — verified against the document text
- **[ROT]** = industry rule of thumb (ACRP Report 25 *Airport Passenger Terminal Planning and Design*, ACRP Report 96 *Apron Planning and Design Guidebook*, IATA ADRM, and common consultant practice)
- **[Obs]** = approximate value observed/measured from real airport plans and imagery; treat as ±15%

On an FAA airport diagram, the terminal complex reads as: **black building footprint** (processor + concourses/satellites) sitting inside a **gray apron polygon**, with the apron edge facing the taxiway system. Everything below is written to make those two shapes, and the gap between them and the runways, come out right.

---

## 1. Configuration Taxonomy

AC 5360-13A §6.5 recognizes four basic configurations — **linear, pier, satellite, remote (transporter)** — and notes that "many existing and planned airport passenger terminals use a hybrid concept" [AC 5360-13A]. Industry practice adds curvilinear-linear and the unit-terminal pattern as distinct plan-view species.

### 1.1 Linear
- **Plan-view geometry:** One long bar. Aircraft park nose-in, perpendicular to the airside face; the landside face carries the curb. The processor and the gate frontage are the *same building*, so the footprint is a single rectangle, typically much longer than deep (aspect ratio 4:1 to 10:1).
- **When used:** Small-to-medium O&D airports where walk distances stay manageable; "still ideal for smaller terminals that largely serve O&D activity" [AC 5360-13A §6.5.1].
- **Gate counts:** ~5–15 gates for a simple linear terminal; up to ~25–40 before walking distance forces a different shape [ROT].
- **Expansion:** Lengthen the bar at either end ("expansion potential to either side" [AC 5360-13A]); when the site runs out, sprout a stub pier from one end — at which point it becomes a hybrid.
- **US examples:** San Jose (SJC) and Dallas–Fort Worth cited by the AC itself [AC 5360-13A §6.5.1.3]; also Kansas City (new MCI, 2023), Sacramento (SMF), Ontario (ONT), Ted Stevens Anchorage (ANC) south terminal.

### 1.2 Curvilinear linear
- **Plan-view geometry:** A linear terminal bent into an arc or half-ring so more gate frontage fits around a compact landside core. Aircraft park on the **convex** (outer) side; curb and parking sit in the **concave** pocket. Footprint = annular band, typically 60–120 ft deep radially, sweeping 120°–300°.
- **When used:** Drive-to-gate era designs (1960s–70s) that minimized curb-to-gate walk; each arc is usually also a *unit terminal*.
- **Gate counts:** ~15–35 gates per arc [Obs].
- **Expansion:** Build another arc along the spine road — arcs replicate rather than grow. Infill of the arc ends is common (DFW D).
- **US examples:** DFW Terminals A–E (semicircles); old Kansas City MCI's three horseshoes (demolished 2023 — good historical model); LaGuardia's former Central Terminal arc; Newark A/B/C's three-lobed rounded units [Obs].

### 1.3 Pier (finger)
- **Plan-view geometry:** A processor block on the landside with one or more narrow fingers extending airside; "aircraft are usually arranged around the axis of the pier in a perpendicular, nose-in position" with gates on one or both sides [AC 5360-13A §6.5.2]. In silhouette: a comb, T, Y, or star. Piers meet the processor at right angles or splay at 30–60° to open up apron between fingers.
- **When used:** The default mid-size/large US pattern; "double-loaded pier concourses efficiently utilize space and can be an effective solution in land-constrained situations" [AC 5360-13A].
- **Gate counts:** 10–30 gates per pier; multi-pier complexes 40–120 [ROT].
- **Expansion:** Lengthen a pier, then add parallel piers; angle between adjacent piers must leave apron for two rows of tails plus taxilane (see §2.6).
- **US examples (AC-cited):** LaGuardia, Washington Reagan National (DCA), Miami (MIA), Houston Intercontinental (IAH), Phoenix Sky Harbor (PHX) [AC 5360-13A §6.5.2.3]. Also ORD Terminals 1–3, SFO, EWR, SEA main terminal, BOS.

### 1.4 Satellite
- **Plan-view geometry:** Gate concourse(s) **physically detached** from the processor, "connected at grade, above grade, or below grade" by walkway, bridge, tunnel, or APM [AC 5360-13A §6.5.3]. Two sub-species: **round/X/cruciform satellites** (a compact blob at the end of an umbilical) and **midfield linear satellites** (long parallel bars floating in the airfield, tunnel-connected so no visible link).
- **When used:** High-connect hub traffic; "efficient space utilization... typically suitable for airports that have a high percentage of connecting traffic" [AC 5360-13A].
- **Gate counts:** 20–45 gates per bar/blob; DEN's Concourse B exceeds 70 [Obs].
- **Expansion:** Lengthen a bar at both ends, or add another parallel bar one apron-module farther out.
- **US examples (AC-cited):** Atlanta (ATL), Denver (DEN), Chicago O'Hare (T1 Concourse C) [AC 5360-13A §6.5.3.5]. Also IAD midfield concourses, MCO's four X-shaped airsides, TPA's airsides, SEA's N and S satellites, PIT's X, LAS's D and E.

### 1.5 Transporter / remote
- **Plan-view geometry:** No gate concourse at all — a processor block plus open hardstand apron with rows of aircraft parked remotely; mobile lounges or buses cross the apron. Footprint = one modest building + a very large gray field with aircraft rows. "Uncommon in the United States" [AC 5360-13A §6.5.4].
- **Gate counts:** Elastic; hardstand rows of 6–12 aircraft each.
- **Expansion:** Just add pavement.
- **US examples:** Washington Dulles as originally built (Saarinen mobile-lounge system, 1962 — the classic); today survives only as supplemental bussing at IAD, and remote hardstand ops at LAX (west remote gates), BOS, and JFK during peaks [Obs].

### 1.6 Unit terminal
- **Plan-view geometry:** Multiple self-contained terminals (each with own curb, processor, gates) repeated along a landside spine road or around a loop. Each unit may internally be linear, pier, or satellite. "In a decentralized configuration, multiple terminal processors serve different concourses, piers, or satellite concourses" [AC 5360-13A §6.5.5]; the AC notes dominant carriers often drive this.
- **Gate counts:** 10–60 per unit; 100–200 for the complex.
- **Expansion:** Build the next unit on the reserved spine/loop frontage.
- **US examples:** JFK (5 active units around a loop), LAX (9 units around a U), DFW (units strung on a spine), EWR, SFO (ring of 4), ORD (3 units + T5).

### 1.7 Hybrids (the majority of big US airports)
Common recipes, useful as generator archetypes:
- **Pier + satellite:** SEA (piers A–D plus two detached satellites), ORD T1 (B pier + detached C satellite bar joined by tunnel).
- **Processor + APM + X-satellites:** MCO, TPA, PIT — compact landside block, thin elevated APM lines to 2–4 chunky satellites 1,500–3,000 ft away.
- **Linear-midfield:** DTW McNamara, IAD, DEN, ATL — landside headhouse at one edge, long parallel detached bars in the midfield.
- **Accreted pier-mall:** MSP T1, PHL, CLT — decades of piers grown into a nearly continuous jagged mass.

---

## 2. Dimensional Data for Top-Down Footprints

### 2.1 Controlling aircraft dimensions (drive everything else)

| Class | Design aircraft | Wingspan | Length |
|---|---|---|---|
| ADG II / regional | CRJ-700/900, ERJ-145 | 76–81 ft | 106–119 ft |
| ADG III narrowbody | A320/B737-800 (winglets), A321 | 117.5 ft (ADG III max 118 ft [AC 5300-13B]) | 123–146 ft |
| ADG IV | B767-300, B757-300 | 156 ft (max 171 ft) | 180–242 ft |
| ADG V widebody | B787-9, A330, B777-300ER | 197–213 ft (max 214 ft [AC 5300-13B]) | 206–242 ft |
| ADG VI | B747-8, A380 | 224–262 ft | 238–250 ft |

### 2.2 Gate spacing along a concourse face
Gate module = wingspan + wingtip clearance. AC 5360-13A §7.3.5.1 gives the industry-accepted planning clearances: **25 ft wingtip-to-wingtip between parked aircraft, and 45 ft wingtip-to-building-façade for inboard pier gates** [AC 5360-13A].

| Gate type | Center-to-center spacing along face |
|---|---|
| Regional jet (ADG II) | 95–115 ft [ROT] |
| Narrowbody ADG III | **140–150 ft** (117.5 + 25 ≈ 142 ft) [AC-derived] |
| ADG IV | 175–195 ft [ROT] |
| Widebody ADG V | **230–250 ft** (213 + 25 ≈ 238 ft) [AC-derived] |
| ADG VI | 285–300 ft [ROT] |
| MARS gate (1 widebody = 2 narrowbody positions) | ~250–260 ft module [ROT] |

Generator shortcut: narrowbody concourses yield **~1 gate per 145 ft of face per side**; a 1,000-ft double-loaded pier ≈ 13–14 narrowbody gates.

### 2.3 Concourse / pier width (building footprint depth)

| Type | Width | Source |
|---|---|---|
| Single-loaded concourse (gates one side, corridor other) | 40–65 ft | [ROT] |
| Double-loaded, regional/narrowbody, modest concessions | 60–90 ft | [ROT] |
| Modern hub double-loaded (deep holdrooms + concessions spine) | 100–160 ft | [ROT/Obs] |
| Mega-hub midfield bar (ATL, DEN, DTW class) | 120–200 ft | [Obs] |
| Node/junction bulges (concession cores, pier roots, rotundas) | 1.5–2.5× run width | [Obs] |

Typical pier/concourse **lengths**: 700–1,500 ft for a mid-size pier; 2,000–2,600 ft for a hub bar (ATL concourses ≈ half a mile ≈ 2,600 ft); DEN B is longer still after its 2020–22 end extensions [Obs]. Above ~1,500 ft, real designs add moving walkways; above ~2,500 ft, trains.

### 2.4 Processor (headhouse) block
- **Depth (landside curb face → secure side):** 150–300 ft for small/medium terminals; 300–450 ft for large hubs with recheck halls and mezzanines [ROT/Obs].
- **Length:** matches required curb + ticket hall: 400–800 ft small, 800–1,500 ft medium, 1,500–2,300 ft mega (ATL domestic, DFW D, DEN Jeppesen ≈ 900 × 240 ft) [Obs].
- Footprint area sanity check: ~0.08–0.15 sq ft of terminal building per annual enplanement, or ~150–200 sq ft per peak-hour passenger [ROT, ACRP 25].
- In silhouette the processor is the **thickest, blockiest rectangle** in the complex; concourses are thin appendages of it (attached) or detached bars.

### 2.5 Satellite dimensions
- **Round/drum satellite:** 150–250 ft diameter, 6–10 gates around the rim (classic LAS A/B/C gates, old ORD-style rotunda pier ends) [Obs].
- **X / cruciform satellite:** overall 600–900 ft tip-to-tip, arm width 60–100 ft, 15–25 gates (MCO airsides, PIT center X ~1,100 ft tip-to-tip) [Obs].
- **Midfield bar satellite:** the dimensions of §2.3's hub bars: 120–200 ft wide × 2,000–3,500+ ft long, 30–75 gates.
- **T/H-shaped satellites:** SEA N Sat (~500 × 400 ft L-block), MSP's G pier end. Any compact polygon 400–900 ft across works.

### 2.6 Apron depth from building face to taxilane (the gray band)
Stack-up, per AC 5300-13B Table 4-1 + AC 5360-13A §7.3.5:

1. Nose-to-building clearance: 15–30 ft [AC 5360-13A, ROT]
2. Aircraft length (parked nose-in): §2.1
3. Tail-of-stand service road: **20–25 ft wide, two-way** [AC 5360-13A §7.1.3]
4. Clearance to taxilane centerline: **taxilane CL-to-object = 79 ft (ADG III), 135 ft (ADG V)** [AC 5300-13B Table 4-1]
5. Optional second (dual) taxilane: **CL-to-CL 138 ft (ADG III), 242 ft (ADG V)** [AC 5300-13B Table 4-1]
6. Far side of last taxilane to apron edge: another CL-to-object (79 / 135 ft)

Resulting **building face → apron edge** gray-band depths:

| Case | Single taxilane | Dual taxilanes |
|---|---|---|
| Narrowbody (ADG III) | **~340–380 ft** | **~480–520 ft** |
| Widebody (ADG V) | **~560–620 ft** | **~800–860 ft** |

[AC-derived stack-up] Between two parallel piers/bars serving narrowbody aircraft, the clear **face-to-face separation** is therefore ≈ 2 × gate depth + taxilane allowance: **~630–700 ft for a single shared taxilane, ~770–840 ft for dual** [AC-derived]; real hub bar spacing runs 900–1,600 ft center-to-center (widebody + dual lanes + service margins) [Obs].

### 2.7 Connectors (how detached pieces attach)
- **Tunnel / underground APM:** no surface footprint — draw satellite bars fully detached (ATL, IAD, DEN B/C, SEA, ORD T1-C). This is why FAA diagrams of hub airports show free-floating black bars.
- **Above-grade bridge:** thin 30–60 ft neck crossing the apron, sometimes tall enough to taxi an ADG III/IV aircraft beneath (DEN A bridge, ORD's planned T1 links) [Obs].
- **Elevated APM guideway:** drawn (if at all) as a 25–35 ft wide double line from processor to satellite (MCO, TPA, PIT) [Obs].
- **At-grade connector:** 40–80 ft wide corridor stub — makes a "satellite" read as a dumbbell pier (LAX TBIT–MSC bridge/neck, LAS C connector) [Obs].

---

## 3. How Terminal Complexes Grow

Phased expansion is the reason real silhouettes look accreted rather than designed. Canonical sequence, each step visible in plan:

1. **Stretch the linear bar** — the original terminal lengthens until the curb or site ends. (Plan view: rectangle gets longer, often with visible width steps at phase joints.)
2. **Push out a pier** — a finger grows from the bar's airside face; then a second and third at intervals of one apron module (§2.6). (Comb silhouette; fingers rarely the same length or age — expect ragged, mixed-width fingers with bulged tips.)
3. **Lengthen and bulge piers** — pier extensions add length and often a wider, newer cross-section or a rotunda/hammerhead at the tip (extra gates around the end).
4. **Detach: add a satellite** — when contiguous apron is exhausted, the next concourse jumps across the taxilane as a tunnel- or bridge-connected bar/blob (ORD T1-C, SEA satellites).
5. **Go midfield** — a new full-length parallel bar lands between the runways, one module beyond the last (ATL added E in 1994 then F in 2012 at the east end; DEN reserved room for a fourth bar north of C).
6. **Second unit terminal** — a whole new curb+processor+gates unit appears down the spine road (IAH, DFW D, MSP T2) or across the field.
7. **Landside consolidation** — later phases often *fill in*: infill between pier roots, headhouse expansions toward the curb, garages replacing surface lots.

**What the accreted result looks like:** a thick landside block with a flat front; an airside edge that is jagged, asymmetric, and multi-generational — fingers of different lengths/widths, one or two detached bars farther out, and leftover apron notches (used for RON parking) between old and new geometry. Symmetric, uniform complexes (DFW, DEN, MCO) are the signature of *master-planned* airports; asymmetric tangles (MSP, PHL, ORD T3) are the signature of accretion. A generator should support both modes.

---

## 4. Relationship to the Airfield

### 4.1 Setbacks from runways
- Runway CL → parallel taxiway CL: **240 ft** (ADG I–II visual), **300 ft** (typical C/D up to ADG IV), **400 ft** (approach visibility < ¾ mile, or ADG V/VI) [legacy AC 5300-13A tables; 13B moved exact values to the online Runway Design Standards Matrix].
- Runway CL → aircraft parking (apron edge): **400 ft** minimum for C/D runways, **500 ft** common planning value for ADG V and low-visibility runways [legacy 13A / ROT].
- Practical building setback: with parallel taxiway + apron taxilane(s) + gate depth stacked between runway and terminal, real terminal **building faces sit ≥ 900–1,500 ft from the nearest runway centerline**; midfield bars between a runway pair sit roughly centered with ≥ 1,200 ft to each CL [Obs/AC-derived]. Buildings must also stay below Part 77 transitional surfaces and behind the airport's BRL.

### 4.2 Single vs dual apron taxilanes behind gates
AC 5300-13B Figure 4-7 explicitly draws both cases: a **single taxilane** flanked by service roads at the building face and at the TLOFA edge, and **dual taxilanes** for push-back-and-hold operation [AC 5300-13B]. Rules for a generator:
- Dead-end alleys between two piers: single taxilane acceptable up to ~8–10 gates per side; through-routes and alleys > 10 gates get **dual taxilanes** so one aircraft can push while another taxis [ROT].
- The face of a hub midfield bar almost always has dual taxilanes on both sides (that is what sets the 900–1,600 ft bar spacing).
- Separations: taxilane CL–CL 138 ft ADG III / 242 ft ADG V; taxilane CL to object 79 ft / 135 ft [AC 5300-13B Table 4-1].

### 4.3 RON / hardstand positions
"RON positions are used for parking non-active aircraft away from the terminal... essential at international airports... or airports with heavy, frequent service peaks" [AC 5360-13A §7.2.3]. On diagrams they appear as **extra gray apron with no building**: pier-tip aprons, notches between old/new construction, a strip along the cargo apron, or a dedicated remote apron 1 aircraft-row deep (~200 ft narrowbody, ~280 ft widebody) plus taxilane. Count ≈ 10–25% of gate count at hubs [ROT].

### 4.4 Deicing near the terminal
Two patterns [AC 5360-13A §7.5.1 & AC 150/5300-14C]:
- **At-gate deicing** (moderate climates): invisible in plan — just the gate.
- **Dedicated deice pads** (snow hubs): rectangular pads holding 2–6 aircraft abreast, located on the taxi route *toward departure runway ends* — typically at apron exits or alongside queue taxiways, 500–2,000 ft from the terminal. Pad module ≈ one ADG envelope (wingspan + 25 ft) wide × aircraft length + 50 ft deep, with glycol-collection aprons; drawn as distinct gray pads separated from the main apron [ROT/Obs]. Apron grades always slope away from the concourse [AC 5360-13A §7.4.1].

### 4.5 Service roads (head- and tail-of-stand)
"Vehicle service roads... are typically two-way roads that are 20 to 25 feet wide," located "behind the aircraft's tail (back of stand), in front of the aircraft nose (head of stand), between wingtips, or routed beneath the concourse" [AC 5360-13A §7.1.3, §7.3.5.1]. In plan these live *inside the gray apron*: a head-of-stand lane hugging the building face and a tail-of-stand lane at the TLOFA edge — they explain the constant-width clear strip that outlines every concourse on detailed aprons. GSE staging occupies the wedges between parked wingtips.

---

## 5. Landside Face — Why the Front of the Silhouette Is Flat

- **Curb frontage** wants to be straight or gently curved because it is a roadway: "curbside roadways — located adjacent to the terminal ticket lobby and baggage claim areas... used to drop off and pick up" [AC 5360-13A §8.3]. Vehicles can't serve a jagged edge, so the landside façade is one continuous line the length of the processor. Big airports run **double-level curbs** (departures above arrivals) — same footprint line, so no added plan complexity. Curb length needed ≈ 1.0–1.3 linear ft per design-hour originating passenger, split across levels; practical totals 800–3,000 ft [ROT, ACRP 40/25].
- **Roadway loop:** the curb road, 2–4 lanes plus bypass lanes (60–120 ft of pavement), parallels the façade, with recirculation ramps at the ends [AC 5360-13A §8.3].
- **Parking structures** sit directly across the loop from the processor, 150–400 ft from the façade: big clean rectangles ~300 × 600 ft up to ~600 × 1,200 ft, often 2 side by side, aligned parallel to the terminal front [Obs]. In horseshoe/arc layouts (LAX, DFW, old MCI) the garage fills the concave pocket.
- **Net effect for silhouettes:** the landside edge of the black footprint is a **single long straight (or one-radius curved) line**, with at most a porte-cochère bump; all articulation — fingers, satellites, hammerheads, notches — happens on the airside edge. A generator can enforce: landside edge = 1 segment; airside edge = many segments.

---

## 6. Silhouette Vocabulary — Eight Famous US Complexes

As they read on an FAA airport diagram (black shapes on gray apron):

- **ATL** — Two blocky headhouses (domestic west, international east) bracketing **seven detached parallel bars** (T, A–F, each ~2,300–2,600 ft long, ~120–150 ft wide) evenly spaced ~1,000 ft apart, perpendicular tunnel connection invisible: a perfect comb with no spine.
- **ORD** — A compact core tangle: three unit terminals around a U-shaped landside loop sprouting **Y- and star-shaped piers** in every direction (T1's two long parallel bars — one detached, tunnel-linked; T3's four-finger star), plus a separate angled linear T5 to the southeast.
- **DFW** — Five **shallow semicircular arcs** (A–E) strung symmetrically along a central north–south spine road, aircraft on the convex faces, garages in the pockets — like parentheses stacked down a centerline, with a newer stub pier (D/high-gates) breaking the purity.
- **IAD** — One long thin rectangle (the ~1,240-ft Saarinen headhouse) near the landside edge, and **two very long detached parallel bars** (A/B and C/D midfield concourses, each ~2,000+ ft) floating to its south with no visible connection (AeroTrain tunnels), the whole set parallel and orthogonal to the north–south runway pair.
- **JFK** — A **ring of five dissimilar unit terminals** around a huge central loop-road-and-parking oval: T4 a long spine with two splayed piers, T5 a crescent behind the preserved TWA drum, T8 a wide block with two stub piers — no two units alike, all pointing gates outward from the ring.
- **LAX** — Nine unit terminals forming a tight **U (horseshoe) opening east** around the two-level loop road, each a modest block with short piers; TBIT anchors the west end with a detached **midfield satellite bar** farther west, between the paired north and south runway sets.
- **MSP** — The classic **accreted pier-mall**: T1 is an asymmetric spider — two long arms (Concourses A/B) angling southeast, a dense mall of short parallel fingers (C–G) fanning northeast — reading as one continuous jagged mass; a separate compact linear/pier unit (T2) sits across the field.
- **DEN** — One large square-ish headhouse (Jeppesen, ~900 ft) at the south edge feeding **three identical detached parallel bars** (A, B, C, each 3,000+ ft after extensions) marching north at ~1,500-ft spacing — a ruler-straight comb the runways pinwheel around.

---

## Quick generator cheat-sheet (all values above, condensed)

| Parameter | Narrowbody (ADG III) | Widebody (ADG V) | Source |
|---|---|---|---|
| Gate spacing along face | 140–150 ft | 230–250 ft | AC-derived |
| Wingtip clearance (parked) | 25 ft | 25 ft | AC 5360-13A |
| Pier wingtip to façade (inboard) | 45 ft | 45 ft | AC 5360-13A |
| Gate depth (face → tail road outer edge) | 190–215 ft | 290–320 ft | AC-derived |
| Taxilane CL to object | 79 ft | 135 ft | AC 5300-13B T4-1 |
| Dual taxilane CL–CL | 138 ft | 242 ft | AC 5300-13B T4-1 |
| Apron band, face → edge (single/dual lane) | ~360 / ~500 ft | ~590 / ~830 ft | AC-derived |
| Concourse width (double-loaded) | 70–160 ft | 100–200 ft | ROT |
| Pier length | 700–1,500 ft | hub bars 2,000–3,500 ft | Obs |
| Processor block | 150–450 ft deep × 400–2,300 ft long | — | ROT/Obs |
| Parallel bar spacing (center-to-center) | 900–1,600 ft | — | Obs |
| Service road width | 20–25 ft | 20–25 ft | AC 5360-13A |
| Runway CL → apron edge | ≥ 400–500 ft | — | legacy 13A/ROT |
| Runway CL → building face (practical) | ≥ 900–1,500 ft | — | Obs |
