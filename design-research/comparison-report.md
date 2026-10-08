# Comparison phase report

Implemented on design/upgrade after the user requested continued development. No merge, deployment, baseline promotion, stored-schema change, new service, or paid dependency.

## Delivered

- Read-only baseline/current comparison computed from local PNG evidence when review loads. Existing CLI threshold and baseline provenance are reused; stale diff rows are not trusted.
- Comparison labels separate visual change from diagnostic flags and review verdicts.
- Only changed filter covers new captures, pixel changes above threshold, and dimension changes.
- Viewer has Current, Baseline, Difference, and Compare both modes. Desktop comparison uses two panes; mobile stacks the captures. Native size inspection, download, keyboard navigation, and focus return remain available.
- Missing baseline, corrupt evidence, failed capture, and different dimensions have explicit states. No pixel overlay is offered for mismatched dimensions.
- Export includes comparison evidence. Existing review decisions and notes still save through the same API.

Contract and implementation decisions: comparison-plan.md. Sources: followup-research.md, particularly the browser-loaded Chromatic comparison documentation and Argos baseline/provenance pages.

## Screenshot evidence and rubric

Original review/viewer screenshots remain in screenshots/before. Updated existing state screenshots are in screenshots/after and their prior versions remain in Git history. New generated comparison evidence:

| State | Desktop | Mobile |
| --- | --- | --- |
| Review / all six statuses | comparison-review-1280.png | comparison-review-390.png |
| Baseline and current | comparison-split-1280.png | comparison-split-390.png |
| Difference | comparison-diff-1280.png | comparison-diff-390.png |
| Combined dark | comparison-split-dark-1280.png | comparison-split-dark-390.png |
| Difference dark | comparison-diff-dark-1280.png | comparison-diff-dark-390.png |

All filenames above are under screenshots/after and were captured in Chromium. Fixtures use the project's own previously captured demo PNGs, with deliberate generated pixel/size changes and invalid evidence; they are not real regressions or customer data.

First browser inspection exposed unclear mobile Side by side wording and overlapping native-size panes as craft/audience concerns (3/5). The second round uses Compare both, stacks on mobile, and disables native-size expansion in the combined view. Individual modes retain native-size inspection. Final scores: point of view 4; typography 4; layout/rhythm 4; color/imagery 4; motion 4; audience fit 5; memorability 4; craft 4. These are design judgments, not automated metrics. The calm review design is preserved rather than adding decorative motion.

## Verification

- 40 unit tests across 9 files pass, including fresh pixel comparison, provenance, missing/corrupt evidence, size mismatch, traversal, and escaping symlinks.
- TypeScript, lint, HTML build, and CLI compilation pass. The existing capture.ts:216 lint warning remains unchanged. CLI compilation externalizes dependencies; no packaged distribution claim.
- 70 existing browser journey checks pass at desktop/mobile widths, preserving save/failure/retry/export/filter/keyboard workflows.
- 32 real-server comparison/browser checks pass, including 10 axe checks across review and comparison views in light/dark at desktop/mobile widths. No accessibility violations; one mobile review contrast item requires manual review and is retained in comparison-accessibility.json. Comparison views have no incomplete checks.
- Lighthouse mobile/desktop on both the original 12-capture fixture and the generated six-state comparison fixture: 100 performance / 100 accessibility / 100 best practices. Files: lighthouse-comparison-*.json. These results do not establish performance at hundreds of captures.

The first dark-mode audit ran during the existing 150ms background transition and observed transient contrast. The corrected measurement waits 250ms after changing the emulated system theme. No contrast issue remains in the settled comparison views.

## Remaining work and approval boundaries

Measure large-run performance and repeated-capture stability next. Comparison currently runs synchronously during review load. Four recent image-evidence snapshots are retained in memory; older tabs may need reload, and expired evidence returns 404 instead of silently showing a newer baseline. Runs are treated as immutable capture artifacts; changing current PNGs in place during review is unsupported.

A full manual screen-reader audit remains outstanding. Read-only local comparisons do not require persistent metadata additions. Browser/commit/readiness/history fields, hosted collaboration, cloud sharing, paid integrations, automatic baseline promotion, and destructive changes remain in needs-approval.md and were not implemented.

Preview: localhost:14747 preserves the original generated run. localhost:14749 displays the isolated six-state comparison demo. Neither uses existing example/client data.
