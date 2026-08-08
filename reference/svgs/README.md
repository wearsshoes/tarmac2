# SVG airport-diagram test corpus

This directory contains a deliberately varied, non-navigational test corpus of airport
layout SVGs. It currently has **54 diagrams: 44 international and 10 U.S.** Files are
grouped by the person or authority that published the underlying diagram rather than by
country:

- `derludonaut/` — 43 CC BY 4.0 community-authored layouts by DerLudonaut (formerly
  CellarDoor85), sourced through Wikimedia Commons.
- `jellylovers/` — one CC BY-SA 4.0 future-layout diagram by Jellylovers, sourced
  through Wikimedia Commons.
- `faa-naco/` — 10 public-domain U.S. FAA/NACO diagrams or vector derivatives,
  sourced through Wikimedia Commons. Several were originally converted from FAA PDFs.

`manifest.json` records every file's country/region, publisher, Commons source page,
original download URL, attribution, license, byte size, and SHA-1 checksum. Run
`node fetch.mjs` from this directory to refresh the complete set and regenerate the
manifest.

## Important caveats

- **Do not use these diagrams for navigation.** They are test fixtures and may be old,
  unofficial, incomplete, planned/future layouts, or otherwise inaccurate.
- The local filenames are normalized to airport codes for predictable test discovery;
  `manifest.json` preserves the original Commons filenames.
- SVG quality is intentionally heterogeneous. Some files contain CorelDRAW-specific or
  technically invalid markup, which is useful for parser and renderer stress testing.
- License obligations still apply. In particular, preserve attribution and license
  information when redistributing the CC BY and CC BY-SA files.

## Coverage

The international set includes airports in Australia, Brazil, Canada, China, Croatia,
Denmark, France, Germany, Greece, Hong Kong, Iceland, India, Indonesia, Italy,
Luxembourg, Malaysia, Mexico, the Netherlands, Norway, Portugal, South Korea, Spain,
Sweden, Thailand, Turkey, the United Arab Emirates, and the United Kingdom. The mix
includes single-runway fields, intersecting and parallel runway systems, midfield and
satellite terminals, very large multi-runway hubs, and planned layouts.
