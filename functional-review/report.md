# Functional audit and diagnostic inspection report

Design Spine now connects recorded blank-region diagnostics to the current screenshot, supports region jumps in long captures, and refreshes expired comparisons without clearing drafts. The audit also fixed silent diff-gate passes, capture filename collisions, corrupt-review overwrite, screenshot path escape, malformed URL handling, missed clicks during note saves and invalid app-directory input.

All work is on design/upgrade. Existing example data and original baselines were not inspected or promoted. No merge, deployment, migration, route change, paid call or destructive cleanup occurred. Findings and exact scope are in findings.md, coverage.md and improvements.md.

## Verification

| Check | Actual result |
|---|---|
| Unit/CLI regressions | 73 tests across 12 files pass; important defects reproduced as failing tests before fixes |
| Typecheck | Pass, no emit |
| Lint | Exit 0; one pre-existing capture.ts non-null assertion warning, now line 247 |
| Entry-point builds | UI HTML and Bun CLI builds pass, dependencies external for CLI |
| Review states/journeys | 72 checks pass |
| 1,000-tile pagination | 26 checks pass |
| Comparison states | 32 checks pass, real generated baseline/current/diff files |
| Highlights, expiry, retained failed drafts, downloads | 48 checks pass at 1280/390px in both themes |
| Large native evidence | 8 checks pass with a real-browser 2048×6144 capture |
| File/API persistence and validation | 14 checks pass, including concurrent field patches and byte preservation on corruption |
| Whole CLI workflow | 28 checks pass, including actual capture matrix, theme/init/session isolation, approval and diff, provider executable stub and ratchet refusal |
| Progressive comparison | 12 checks pass with 100 generated baseline pairs; cards and save API remain usable while comparison runs |
| Native controls | 12 checks pass: skip link, disclosure, Enter behavior, exact PNG download and backdrop |
| Axe | 22 runs, zero violations; one incomplete mobile route-link/count contrast assessment remains |
| Lighthouse / real Chrome | Mobile and desktop each 100 performance / 100 accessibility / 100 best practices on the owned 12-capture fixture |

There are 252 browser/API/workflow assertions above, separate from the unit tests. Loading/save/error cases use browser request interception where stated; file persistence, generated capture and command checks use real local files and servers. Claude was an executable stub, not a live paid/provider integration. server-runtime.json records the tested Bun server hostname as localhost.

An earlier browser batch used the stale preview and failed; it was rerun against the fresh current-code preview. A concurrent unit/browser run exceeded existing time limits; the final isolated unit run passed without weakening assertions or timeouts. These failures were investigated rather than counted as successes.

The 100-pair timing observation in progressive-checks.json is local: captures visible around 1.17 seconds, concurrent save around 67 ms, comparison ready around 5.25 seconds. It is slower than an earlier session observation; host load was not controlled across sessions, so this is not evidence of a measured performance improvement. Each PNG decode/diff remains synchronous. Controlled profiling of mixed high-resolution libraries remains the next performance investigation.

## Visual evidence

Every screenshot below was made by a real Playwright/Chrome browser. Earlier screenshots are explicitly historical; fresh evidence lives in this folder.

| Template/state | Before | Current desktop / mobile |
|---|---|---|
| Review workspace | [1280px](/Volumes/LizsDisk/design-spine/design-research/screenshots/before/review-1280.png) / [390px](/Volumes/LizsDisk/design-spine/design-research/screenshots/before/review-390.png) | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/review-final-light-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/review-final-light-390.png) |
| Diagnostic viewer | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/viewer-before-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/viewer-before-390.png) | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/viewer-highlight-light-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/viewer-highlight-light-390.png) |
| Long-image diagnostic | New feature | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/large-jump-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/large-jump-390.png) |
| Compare both | Historical [comparison report](/Volumes/LizsDisk/design-spine/design-research/comparison-report.md) | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/comparison-split-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/comparison-split-390.png) |
| Difference | Historical comparison report | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/comparison-diff-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/comparison-diff-390.png) |
| Loading | Earlier [upgrade report](/Volumes/LizsDisk/design-spine/design-research/report.md) | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/loading-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/loading-390.png) |
| Load error | Earlier upgrade report | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/load-error-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/load-error-390.png) |
| Empty run | [1280px](/Volumes/LizsDisk/design-spine/design-research/screenshots/before/empty-1280.png) / [390px](/Volumes/LizsDisk/design-spine/design-research/screenshots/before/empty-390.png) | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/empty-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/empty-390.png) |
| No matches | Earlier upgrade report | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/no-results-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/no-results-390.png) |
| Save success | Earlier upgrade report | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/saved-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/saved-390.png) |
| Save failure | Earlier upgrade report | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/save-error-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/save-error-390.png) |
| Missing image | Earlier upgrade report | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/missing-image-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/missing-image-390.png) |
| Pending comparison | Earlier [scale report](/Volumes/LizsDisk/design-spine/design-research/scale-readiness-report.md) | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/comparison-progressive-pending-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/comparison-progressive-pending-390.png) |
| Comparison failure | Earlier scale report | [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/comparison-progressive-error-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/regression/comparison-progressive-error-390.png) |

Dark-theme evidence: [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/review-final-dark-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/review-final-dark-390.png) (review), [1280px](/Volumes/LizsDisk/design-spine/functional-review/evidence/viewer-highlight-dark-1280.png) / [390px](/Volumes/LizsDisk/design-spine/functional-review/evidence/viewer-highlight-dark-390.png) (highlight viewer). The final review fixture adds one explicitly generated diagnostic entry to exercise disclosure; raw captured images are unchanged.

The demo fixture pages retain intentional defects. Outlines are possible blank-region evidence, not a claim that every flat area is a design mistake. Broken-image, overflow and clipped-text diagnostics have no stored coordinates, so this feature does not invent positions for them.

Current viewer/workspace rubric (1–5): point of view 4, typography 4, layout/rhythm 4, color/imagery 4, motion 4, audience fit 5, memorability 4, craft 4. The existing paper/ink direction remains consistent; screenshots stay central. Iterations corrected SVG visibility, image/frame alignment, mobile label wrapping and save-status movement. Motion follows reduced-motion preferences and direct inspection jumps remain immediate. Craft is limited by the untested environments below; no score claims universal accessibility.

## Gaps and exclusions

- No manual screen-reader session, physical low-end device test or multi-hour soak. Retention expiry was deliberately triggered with five new comparison snapshots.
- One axe contrast item is incomplete for mobile offscreen route links/count text; zero reported violations does not resolve it.
- No live Claude authentication, rate-limit, timeout or provider quality test. The stub verifies orchestration and persistence only.
- Diverse 1,000-pair high-resolution libraries, independent concurrent CLI writers, arbitrary malformed manifests and corrupted ancillary inventories are not exhaustively verified.
- Capture readiness edge cases have prior generated-fixture evidence in design-research; third-party authenticated/polling sites are excluded.
- There is no automatic repair of damaged review files. They are preserved for restoration from a trusted copy.

## Needs approval — full current list
# Needs approval

Not implemented:

- Hosted accounts, team collaboration, cloud capture storage, paid visual testing integrations, and API keys: introduce services, cost, and data-boundary decisions.
- New persistent run metadata, CMS/schema changes, or database migrations: not needed for the chosen local review workflow.
- Removing or restyling intentionally imperfect demo fixture pages: would weaken capture diagnostics; preserved.
- Deleting existing captures, baselines, or example data: preserved.
- Changing existing routes or automatically promoting screenshots to baselines: preserved existing explicit CLI workflow.

No destructive or production changes are authorized or planned.

Follow-up research: persisting browser/commit/capture-readiness metadata or comparison history requires approval before changing the stored content shape. Reading existing baseline provenance and diff artifacts does not require those new fields.

Capture stability experiment: forcing `animations: 'disabled'` completes finite animations and resets infinite animations during screenshot capture. This changes visual semantics and may alter existing comparisons. It was tested only on a generated page and was not applied to the default pipeline. A configurable policy and its baseline implications need approval before implementation.

Functional audit follow-up: introducing a collision-proof filename convention and migrating existing captures/baselines would change evidence identity and existing files. This audit rejects colliding combinations before capture instead; any naming migration needs approval. Existing route URLs and formats are preserved.
