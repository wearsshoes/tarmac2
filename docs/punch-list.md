# Punch list — from the first working review of this engine

State at review: Phase 0 scaffold complete (pure engine + Vite shell, deterministic
seeds, CLI renderer, 17 passing tests). Sheet furniture is close to spec. The airfield
core — Phases 1, 4, 5 — is stubbed. Items ordered by visual impact; each cites the
spec/harvest section that governs the fix.

## P1. Runway rendering bug — every non-primary runway draws hollow
Secondary runways render as outlined/dashed bars that read as "closed / under
construction." All active hard-surface runways must be solid black fills (spec B4).
Centerline-light runways get a white dotted line *inside* the solid bar, not instead of
it. Likely cause: centerline-light styling or fill logic applied only past index 0.

## P2. Pavement is strokes, not areas
Taxiways draw as single thin gray strokes; stray gray lines cross runways and continue.
Build the Phase-1 pavement kit (spec A3, B4; harvest H4/H9): centerline + width →
ribbon; junctions → filleted patches; union everything into one flat #CFCFCF layer. No
square corners anywhere; flared throats at runway junctions; high-speed exits as real
30° curves landing on the parallel; threshold jogs. Delete any taxiway segment that
crosses a runway it doesn't connect to.

## P3. Terminal grammar missing
Terminals render as thin black sticks labeled TERMINAL 1/2/3 on a generic rounded-rect
apron (real aprons never have rounded corners). Implement the composition module per
`terminal-design.md` (dimensions, configurations, growth patterns) using the drawing
machinery in harvest H5: bar frames, notched processors, tee/wye/pod/rotunda caps,
finger piers, arc bands, satellites with flat faces and 30% tunnel-only connectors,
apron polygons that hug the silhouette with discrete staggered throats.

## P4. Mode collapse — every seed composes the same
All fields lean NNE with the terminal east-southeast at similar page scale; six seeds
produced two "FRONTIER"s. Fixes: wind axis drawn from the full 0–180° range and driving
whole-layout orientation; terminal quadrant chosen by parcel/geometry, not constant;
page scale responsive to field extent (GA fields should look small on the sheet);
identity generation ported from harvest H2 (regional prefix boxes + syllable pools).

## P5. Runway-end designators and annotation stations
End numbers (11L etc.) are missing or illegible at thresholds. Port the annotation
station rules from harvest H7: end number outside the threshold clearing blast pad/EMAS,
rotated to read from final approach (unfolded rotation); ELEV at 5.5% of length opposite
the heading label at 16%; dimension label side alternating by runway index.

## P6. Hotspot placement is mechanical
HS 1–5 chain down the primary's connector row. Port the risk-scored derivation
(harvest H4): runway crossings first, true taxiway crossings second, threshold clusters
as fallback, 500-ft suppression between picks.

## P7. Label deconfliction
Collisions visible: mag-var assembly overlaps its own north label; LAHSO label sits on
the runway; CARGO RAMP / CARGO double-label. Implement the placer from harvest H7
(spatial hash, ordered candidates, tiered drop policy) and route every label through it.

## P8. Composition polish (after P1–P7)
- White space discipline: field occupies ~50–60% of plot height, text blocks pushed into
  genuinely empty quadrants (corner packing, harvest H7).
- Landscape rotation for predominantly east-west fields (spec B1).
- Texture menu by role (spec B6): non-movement hatching, boxed lighting notes, inset
  circles, approach-light symbols — sprinkled, never all at once.
- Embedded geometric-sans font + PNG export background fill (harvest H8).

## Testing follow-ups
- Add the rendering-convention suite from build-plan Phase 8 and run it against the four
  reference SVGs (they currently only back 27 assertions).
- Property test for P1 explicitly: every open runway's fill is solid black.
- Determinism: same seed → byte-identical SVG (exists); add cross-role coverage.
