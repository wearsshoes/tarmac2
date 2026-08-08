# SVG airport-diagram test corpus

This directory contains **73 full aeronautical airport charts: 58 international and
15 U.S.** Each SVG is converted from page 1 of an official publisher PDF and is grouped
by publisher:

- `faa/` — 15 U.S. Federal Aviation Administration airport diagrams.
- `decea-brazil/` — 10 Brazilian DECEA aerodrome charts.
- `airservices-australia/` — 20 Airservices Australia aerodrome charts.
- `sacaa-south-africa/` — 10 South African Civil Aviation Authority charts.
- `fintraffic-finland/` — 8 Fintraffic aerodrome charts.
- `lgs-latvia/` — 5 Latvijas gaisa satiksme aerodrome charts.
- `aai-india/` — 5 Airports Authority of India aerodrome charts.

These are operational-chart-style references, not simplified airport maps. They retain
chart furniture, coordinate grids, frequencies, runway dimensions, taxiway labels,
hotspots, buildings, lighting and navigation aids, scale information, notes, and
publisher-specific symbology.

`manifest.json` records the airport, publisher, source page and PDF, source-license
note, conversion command, byte sizes, and SHA-256 checksums. Run `node fetch.mjs` from
this directory to rebuild the pinned corpus from the official publisher indexes and
regenerate the manifest. The script requires `pdftocairo` and `rsvg-convert`.

## Quality gate

Before bulk collection, one chart from each publisher was converted to SVG and
rasterized for visual inspection:

- FAA: ITH (Ithaca Tompkins International)
- DECEA: SBGR (Sao Paulo/Guarulhos International)
- Airservices Australia: YMML (Melbourne)
- SACAA: FAOR (O.R. Tambo International)
- Fintraffic: EFHK (Helsinki-Vantaa)
- LGS: EVRA (Riga)
- AAI: VIDN (Dehradun/Jolly Grant)

All seven retained the dense, print-chart character expected of the reference set.
SACAA is nearly pure black and gray; Fintraffic and LGS use monochrome foundations with
small safety-color accents; AAI uses a monochrome airport layout with restrained colored
boundary and marking lines. The earlier Wikimedia Commons schematic-layout family was
rejected after its EDDB sample
rasterized as a simplified map without operational chart detail. A UK NATS sample was
also rejected because its colorful landscape format differed substantially from the
FAA-style reference; ten additional Airservices charts replaced that family.

## Important caveats

- **Do not use these files for navigation.** They are test fixtures and will become
  stale as publisher cycles change.
- FAA works are public domain in the United States. The other publishers retain rights
  or attach their own reuse conditions; consult the linked source and current terms
  before redistributing those files.
- The SVGs deliberately preserve publisher-specific and occasionally complex PDF
  output. This makes them useful parser, renderer, typography, clipping, and layout
  stress tests, but they are not hand-optimized SVG.
