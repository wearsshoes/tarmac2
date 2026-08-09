# TARMAC documentation map

This directory is prepared for the next implementation pass. It separates normative
requirements, execution plans, evidence, and historical notes so that an old punch-list
item cannot silently override the researched design.

## Authority order

When documents conflict, use this order:

1. [`spec.md`](spec.md) — the product contract: what the generated airport must mean and
   how the FAA-IAC chart profile must portray it.
2. [`edit-plan.md`](edit-plan.md), [`terminal-generator-plan.md`](terminal-generator-plan.md),
   and [`test-suite-spec.md`](test-suite-spec.md) — the coordinated plan for the next code
   pass.
3. The design and standards references below — evidence and rationale used to interpret
   the spec.
4. Audit documents — observations about the current implementation and reference corpus.
5. Legacy notes — useful recipes and historical findings, never current authority.

If implementation work reveals a real ambiguity, settle it in `spec.md` first, then
update the affected plan and tests in the same change.

## Start here for the next code pass

- [`spec.md`](spec.md): read Part A before changing generation and Part B before changing
  rendering.
- [`edit-plan.md`](edit-plan.md): work the dependency-ordered phases; do not start at the
  visual symptom if its data-model prerequisite is unfinished.
- [`test-suite-spec.md`](test-suite-spec.md): add the phase's contract tests before or with
  implementation. It identifies several current assertions that encode obsolete behavior.
- [`terminal-generator-plan.md`](terminal-generator-plan.md): required reading for any
  work in `src/engine/terminal.ts`, terminal district placement, aprons, landside systems,
  or terminal-related model types.

## Design and standards references

- [`airport-design.md`](airport-design.md) — airfield/site rules and the boundary among
  layout, construction, and chart-presentation sources.
- [`terminal-design.md`](terminal-design.md) — descriptive terminal taxonomy, dimensions,
  growth, operational program, and real-airport silhouettes.
- [`apron-and-paved-surface-design.md`](apron-and-paved-surface-design.md) — terminal
  aprons, non-runway pavement, materials, lifecycle, and causal site services.
- [`iac9-improvement-scope.md`](iac9-improvement-scope.md) — section-by-section scope from
  the 6 May 2025 IAC 9 manual, including ambiguities and acceptance scenarios.
- [`terminal-geometry-catalog.md`](terminal-geometry-catalog.md) — per-airport descriptive
  catalog from the checked-in real-diagram corpus.
- [`real-diagram-features.md`](real-diagram-features.md) — common and variable traits from
  the original small FAA sample.

The source-domain rule is deliberate:

- FAA airport-design and terminal-planning publications determine real-world geometry and
  relationships.
- MWAA supplies owner/site/program/operations constraints and useful DCA/IAD context.
- FAA construction specifications determine materials, installed systems, and physical
  lifecycle—not Airport Diagram symbology.
- IAC 9 and checked FAA diagrams determine which facts the FAA chart shows and how it
  shows them.

Official sources reviewed in the final research pass:

- [MWAA Airports Authority Design Manual](https://www.mwaa.com/business/airports-authority-design-manual)
- [FAA Airport Construction Standards](https://www.faa.gov/airports/engineering/construction_standards)
- [FAA AC 150/5370-10H document record](https://www.faa.gov/airports/resources/advisory_circulars/index.cfm/go/document.current/documentNumber/150_5370-10)

## Current-engine audits

- [`rendering-discrepancies.md`](rendering-discrepancies.md) — visual difference between
  the generated batch and real diagrams.
- [`ungenerated-ground-features.md`](ungenerated-ground-features.md) — missing physical
  ground features and airfield furniture.
- [`unaddressed-diagram-objects.md`](unaddressed-diagram-objects.md) — missing categories
  across model, renderer, page system, and operational overlays.
- [`renderer-layout.md`](renderer-layout.md) — current whitespace-packing and label
  placement contract.

These are diagnosis, not a second backlog. Their findings have been routed into
`edit-plan.md` and `test-suite-spec.md`.

## Legacy implementation notes

- [`build-plan.md`](build-plan.md) — original phase plan; retained for project history.
- [`punch-list.md`](punch-list.md) — first working-review backlog; many items are complete
  or superseded.
- [`harvest.md`](harvest.md) — reusable recipes and constants from an earlier engine.

Legacy material may be reused when it is compatible with the current spec and tests. In
particular, the old rectangular terminal-apron and repeated stepped-throat recipes are
superseded by the semantic edge-role and circulation-driven approach.

## Working-document rules

- Keep `spec.md` concise and normative; place evidence and examples in the design docs.
- Keep implementation sequencing in `edit-plan.md`; do not recreate a backlog in each
  audit.
- Keep terminal implementation detail in `terminal-generator-plan.md` and refer to it
  from the general plan.
- Keep test coverage, fixtures, thresholds, and migration rules in `test-suite-spec.md`.
- Preserve deterministic seeds, but avoid treating the current SVG bytes or current RNG
  draw order as a permanent design contract.
- Never infer visual support from the presence of a physical object. Rendering is always
  selected by an explicit publisher profile.
