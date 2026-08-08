# Renderer layout and whitespace packing

## Why the old layout rendered compact airports too small

The renderer used one global scale ceiling: the 970-unit plot height always represented
at least 12,500 feet. That was reasonable for a long hub runway, but it forced a
3,000–5,000-foot GA airport into a small cluster even when most of the sheet was empty.
`LOCALIZER-SIGNAL-76` exposed the failure clearly: its map scale stopped at `0.0776`
page units per foot.

The fixed communications, field-elevation, magnetic-variation, caution, PCN, notes, and
ramp-frequency coordinates made that ceiling hard to remove. Enlarging the planview
would have put pavement and labels underneath those blocks.

## Reference-diagram finding

The real diagrams treat these blocks as chart furniture, not as a rigid page template.
ORD is the clearest example: communications occupy the upper-right whitespace, the
caution moves to the top, `FIELD ELEV` moves to the lower-left, PCN blocks spread across
the lower whitespace, and magnetic variation uses the lower-right corner. The airfield
remains the dominant visual element while the text conforms to its silhouette.

## Current layout contract

1. Rotate the model using the existing FAA landscape convention and measure its actual
   runway, taxiway, apron, and building extent.
2. Start with a 72% plot-height fit and an 82% plot-width fit. Preserve slightly more
   than one minute of latitude as the only absolute scale ceiling.
3. Rasterize the projected airfield into a coarse occupancy grid. Runways and taxiways
   use sampled path footprints, so diagonal fields do not falsely block entire corner
   rectangles.
4. Pack each furniture block independently into semantically valid regions. Candidate
   corners and sides are ranked by clearance from the airfield and already placed
   furniture; a grid search handles irregular leftover spaces.
5. If any block cannot find clean whitespace, retry the complete plan at 68%, 64%, 60%,
   and finally 56%. Dense airports may step down; compact airports normally keep the
   larger first-pass scale.
6. Register the chosen furniture boxes with the feature-label placer, then render runway,
   taxiway, building, LAHSO, and hotspot annotations around them.

## Annotation collision contract

Rotated runway annotations reserve the axis-aligned page bounds of their rotated text,
not the smaller unrotated source box. Operational labels have first claim on the layout:
runway labels stay on their assigned runway side and controlled offset while searching
along the runway; taxiway identifiers search only along their taxiway and its normal.
Dense taxiway systems may reduce identifier type slightly before using a fallback.

Facility, apron, LAHSO, and hotspot labels place after runway and taxiway identifiers.
Their leaders try direct and orthogonal dogleg routes, select the shortest route with the
fewest text crossings, then reserve the chosen line so subsequent labels avoid it.
Required fallbacks minimize text-on-text overlap before overlap with linework, where the
standard white halo preserves legibility.

The root SVG reports `data-label-overlaps` and `data-label-overlap-items`. The renderer
population test requires zero forced text-on-text collisions across every airport role.

The generated SVG exposes `data-map-scale` on the root and `data-layout-slot` on movable
groups. These attributes are diagnostic and regression-test hooks; they do not affect
the drawing.

For `LOCALIZER-SIGNAL-76`, the map scale is now about `0.15`, nearly twice the former
value, while the visible furniture occupies distinct whitespace regions.
