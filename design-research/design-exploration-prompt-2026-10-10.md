# Prompt for Claude or Antigravity

Use this with the Design Spine repo. It requests design exploration before implementation. Magica may help explore layouts if your environment actually provides it; do not invent an integration or expose API keys.

---

Research and prototype a carefully designed next version of Design Spine, a Liz-owned local website screenshot capture and review tool in `/Volumes/LizsDisk/design-spine`.

First read `design-research/research-2026-10-10.md`, current `src/ui/index.html`, `docs/USAGE.md`, and current repository instructions. Earlier research is historical: verify every claimed missing feature against current code. Do not read confidential CRC/client repositories, secrets, unrelated captures, or private project data.

The objective is precise, efficient review with a recognizable visual identity. Current Spine already has search, filters, progress, keyboard navigation, pagination, current/baseline/difference/split/overlay views, regional change jumps, viewer decisions and image-bound notes, run history/deep links, draft/save recovery, JSON and portable HTML export, coverage/provenance, diagnostic overlays, optional accessibility scans, and explicit CLI baseline approval. Preserve these. Do not propose them as new features.

Investigate these problems:

1. The workspace has been mechanically tightened so screenshots start in the first desktop view. Explore whether a more deliberate hierarchy improves inspection further.
2. Coverage now records planned/captured/failed/skipped/excluded states separately from review completion. Inspect the implementation and improve its presentation without hiding unfinished work.
3. Regional change jumps, an opacity overlay and image-bound note locations now exist. Evaluate their discoverability, alignment and keyboard behavior.
4. Diagnostics and notes need clear context without dominating screenshot evidence.

Create two distinct, reviewable prototypes: (A) a refinement of the existing warm paper/ink/orange review workspace with compact run context and image-first inspection; (B) a change-review inbox with a persistent inspector. Explain which tasks each serves better. Do not produce two recolored versions of the same layout. Keep the current direction as a comparison baseline.

Research references for specific decisions: Chromatic's documented review checklist and changesets; BackstopJS readiness and scenario model; Eagle's quick preview/focus zoom; PureRef's minimal image canvas; Curated's image framing; HOVERSTAT.ES for purposeful individuality. Inspect actual application flows when accessible and distinguish them from public landing pages. Record the source and the exact pattern learned. Never copy a brand or infer a tested workflow from marketing.

Show desktop 1280×800 and mobile 390×844, light/dark interface, long routes, long screenshots, no baseline, dimension mismatch, no capture, active filters with zero results, comparison loading/failure, pending decision, saved decision, and failed note save. Include keyboard focus, 200% zoom, and reduced-motion behavior. Preserve stable hit targets during saves.

Aim for a useful screenshot preview in the initial desktop view and a large evidence canvas inside inspection. Keep active filters, evidence status, and save errors visible. Review decisions, automatic diagnostics, optional model critique, and baseline promotion must remain distinct. Never automatically approve or promote evidence.

Use actual permitted screenshots or synthetic fixtures. No generated hero illustrations, decorative gradients, fake testimonials, fabricated stats, or ornamental dashboard cards. Every visual choice should have a reason tied to hierarchy, image inspection, navigation, accessibility, or brand consistency. “Not AI-looking” is a craft goal, not a claim you can prove with a detector.

Deliver an annotated reference board, both prototypes, a recommendation with trade-offs, a complete state inventory, and a short implementation handoff. Evaluate the same tasks in each: find mobile overflow, inspect a tiny change at the bottom of a long page, reject with a precise note, recover a failed save, and explain incomplete coverage. Record observed time/errors if a human tests them; do not invent usability results.

Keep prototype code isolated from production and existing evidence. Do not rewrite the framework, add hosted services, alter stored formats, or promote/delete baselines as part of visual exploration. Identify backend dependencies explicitly for a later scoped implementation.

If Magica is available, use it only to explore alternatives under these constraints, then inspect and refine its output. Do not accept the first generated result as finished design. Finish with a concrete recommended prototype and reasons, not a generic mood board.
