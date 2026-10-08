# Upgrade progress

Branch: `design/upgrade`. Main and production untouched. User confirmed this scope is Design Spine itself, including continued product improvement.

## Functional audit and diagnostic inspection — complete within recorded scope, 2026-10-08

User approved diagnostic highlights plus the attached full-app functional review. The current audit is in functional-review/coverage.md, findings.md, improvements.md and report.md; all fixture/browser evidence is there. Existing example data remains excluded. This entry supersedes earlier next-step suggestions.

Built current-image blank-region outlines/jumps, native-size long-image inspection and in-page expired-comparison recovery preserving failed drafts. Fixed invalid numeric CLI options (including silent diff false passes), colliding capture filenames, damaged-review overwrite, screenshot symlink escape, malformed image encoding, note-save layout movement losing clicks, and explicit app file paths. Existing file formats, route URLs and approval workflow remain. Filename migration is recorded in needs-approval.md.

Final verification: 73 tests / 12 files, typecheck, lint exit 0 (one existing warning at capture.ts:247), UI/CLI builds. Fresh owned-fixture checks: 72 review, 26 pagination, 32 comparison, 48 viewer/expiry, 8 large evidence, 14 persistence, 28 whole workflow, 12 progressive and 12 native controls. Twenty-two axe runs have zero violations; one mobile offscreen contrast item remains incomplete. Lighthouse mobile/desktop each 100/100/100. A real 2048×6144 browser capture verifies distant jumps. Live provider and manual screen-reader/physical-device tests remain excluded; no universal correctness claim.

Current preview: localhost:14850, source is the owned original fixture. Start with `bun src/cli.ts review --run design-research/.design-spine/runs/2026-10-08T15-32-24-858Z --port 14850`. No merge/deploy or original baseline replacement. Next scope: manual assistive-technology validation, resolve incomplete contrast assessment, and controlled mixed-resolution comparison profiling. The 100-pair fresh timing observation is slower than the prior session, so report.md explicitly does not claim a speed improvement from this phase.

## Scale and capture-readiness phase — complete, 2026-10-08

User requested continued building and excellence across functionality/design. Measured 100/500/1,000 generated captures at desktop/mobile widths with 4× CPU throttling, plus 10/50/100 baseline pairs. Implemented 48-card pages and progressive comparison loading with cooperative server processing. Full-library search, progress, viewer navigation, exports, route jumps, and drafts are preserved. Capture waits up to three seconds for fonts/image decoding after scrolling; existing warning fields are reused. Forced animation disabling remains an approval item.

At 1,000 captures, DOM falls from 17,287 to 1,051 elements. Measured first-render observations improve from 596.8→193.0 ms desktop / 522.6→185.5 ms mobile; clearing search from 94.9→7.7 ms / 72.8→7.8 ms. In the 100-baseline server test captures appear at 211.7 ms and a concurrent save responds in 35.8 ms while comparison continues. These are generated-fixture local observations, not production percentiles.

Validation: 41 unit tests; 72 original browser checks; 32 comparison checks; 26 paging checks; 12 progressive checks; 8 actual-capture/readiness checks. Typecheck/lint/builds pass with the existing capture warning now at line 237. Updated preview Lighthouse mobile/desktop each 100/100/100. Browser evidence, rubric, contract, unknowns, and approval limits are in scale-readiness-plan.md / scale-readiness-report.md. No merge/deploy, schema migration, paid service, or real baseline replacement.

Remaining validation: diverse high-resolution 1,000-baseline runs, physical low-end devices, and manual screen-reader use. Per-image synchronous PNG work and the four-snapshot retention limit remain. Further changes should be scoped from those measurements; do not claim arbitrary scale is solved.

## Comparison implementation — complete, 2026-10-08

User authorized continuing development. comparison-plan.md defines the additive read-only contract; comparison-report.md records the implementation, scores, evidence, and limits. Baseline/current/difference inspection, combined desktop/mobile views, changed-only filtering, provenance, and export evidence are implemented. All six comparison states were exercised with an isolated generated run. Existing baselines and example data untouched; no stored schema or dependency changes.

Validation: 40 tests / 9 files, typecheck, lint, HTML build, and CLI compile pass. 70 existing journey checks and 32 real-server comparison checks pass. Ten comparison-phase axe runs have zero violations; one mobile review contrast item is incomplete because offscreen route links are obscured, recorded rather than counted as fully audited. Comparison views have zero incomplete items. Lighthouse mobile/desktop both with and without generated baseline computation score 100/100/100 for performance/accessibility/best practices. Existing capture lint warning remains. Synchronous comparison performance at hundreds of captures and manual screen-reader use are untested.

Preview: localhost:14747 original fixture; localhost:14749 isolated comparison demo. Next scoped work: large-run measurement and repeated-capture stability experiments. Persistent metadata, cloud integrations, and automatic baseline promotion remain approval items. No merge/deploy.

## Follow-up research — complete, 2026-10-08

User requested continued research after the seven-phase report. Loaded and captured seven public primary-source pages plus the local review. followup-research.md ranks baseline comparison, changed-first triage, existing baseline provenance, capture readiness experiments, and large-run measurement. No claim of authenticated competitor access or newly implemented comparison features.

Confirmed and fixed a note-limit boundary bug: editor allowed 20,000 characters while server stored 2,000. Editor now accepts 2,000 and describes the limit/save trigger. Isolated real-server checks at 1280/390px verify all accepted text persists and Export re-enables. Original reviews and baselines untouched. Before/after evidence and a reusable check are saved in design-research.

Verification: 35 tests pass; typecheck and HTML build pass; lint succeeds with the unchanged capture warning. Eight desktop/mobile/light/dark review/viewer axe checks have zero violations. No new Lighthouse claim. Existing Phase 7 report is historical; this entry and followup-research.md record the subsequent work. Next implementation priority is read-only comparison using existing artifacts; persistent metadata additions remain in needs-approval.md. No merge/deploy.

## Phase 1 — complete

Repository and product template mapped in profile.md. Genuine fixture capture isolated inside design-research; existing example data not read. Review, viewer, and empty states captured at desktop/mobile widths. Demo pages are diagnostic fixtures and will remain unchanged.

## Phase 2 — complete

Twelve live references and nine peers captured with Playwright; sources, SOTD dates, live URLs, visible features and blocks recorded in references.md/features.md. Godly redirects to a social feed; Land-book browser entries are challenged. No authenticated competitor interface was accessed.

## Remaining

3. Freeze direction and ranked feature scope.
4. Foundation plus two homepage screenshot/score/fix rounds.
5. Viewer, empty, loading, error, save-success/failure states, every template.
6. Typecheck, lint, tests, browser journeys, Lighthouse.
7. Report with before/after and limitations; stop without merge.

## Phase 3 — complete

One direction and ranked additive feature scope frozen in plan.md. Routes, fixtures, baseline workflow, and storage schemas preserved. Proceeding directly to foundation and review homepage.

## Phase 4 — complete

Tokens, system-font type scale, shared header/index/buttons/forms/cards/footer and sole review homepage implemented. Two real-browser desktop/mobile rounds captured, scored, and corrected; evidence and rubric in scores.md. Round 1 preview/readability and lazy image evidence issues fixed in round 2. No horizontal overflow; all 12 fixture screenshots loaded. Application interaction/state work remains Phase 5.

## Local services and resume

Demo fixture localhost:14010; review localhost:14747. Start fixture with `bun fixtures/demo-site/serve.ts 14010`; review with `bun src/cli.ts review --run design-research/.design-spine/latest --port 14747`. Browser launch and local listeners need sandbox escalation. Initial sandbox attempts failed; dedicated escalated fixture works. Only review fixture data. Untracked examples/testimoniq/.design-spine remains untouched.

## Phase 5 — complete

- Review template: done, desktop/mobile and light/dark; search, combined filters, route index, decisions, notes, progress and JSON export tested.
- Screenshot viewer: done, desktop/mobile; fit/actual size, previous/next, arrows, Escape and focus return tested.
- Loading/load failure/retry: done, desktop/mobile with controlled browser request delay/503.
- Empty/no results: done, desktop/mobile; distinct recovery actions tested.
- Save success/failure/retry: done, desktop/mobile; failed draft retention across filtering and export safety verified.
- Capture missing/diagnostic warnings/critique pass/fix/error: done, desktop/mobile with fixture payloads.
- Demo page fixtures: preserved and captured at both widths and themes, intentional defects remain.

68 browser checks passed twice; no uncaught errors. Evidence in browser-checks.json and screenshots/after. Mobile toolbar/viewer refined after final screenshot inspection. No persistent schema or endpoint changes.

## Phase 6 — complete

- TypeScript: passed, no emit.
- Vitest: 35 tests / 8 files passed.
- Biome: exit 0; one existing capture.ts:216 non-null assertion warning left unchanged as unrelated. UI is excluded by existing Biome configuration and separately exercised in browser.
- Build: Bun HTML build and CLI compile with dependencies external passed. Initial attempt to bundle Playwright internals failed on optional chromium-bidi imports; externalizing dependencies matches the existing source-run CLI. No distributable packaging claim.
- Browser: 70 meaningful journey/state checks passed; 6 real disk/API persistence checks passed in an isolated generated fixture server. Existing user runs/baselines untouched.
- Accessibility: axe review and open viewer at 1280/390px in light/dark: zero violations and zero incomplete checks in all 8 combinations after fixing keyboard scrolling regions. No claim of a complete manual assistive-technology audit.
- Lighthouse 13.5.0 using Chrome for Testing: final mobile and desktop each 100 performance / 100 accessibility / 100 best practices. Original UI on read-only baseline server: mobile 90/100/92; desktop 83/100/96. Mobile CLS 0.207 → 0.029; desktop 0.337 → 0.005. Local fixture results, not a guarantee for arbitrary screenshot libraries.
- Final screenshot evidence recaptured after audit fixes. Uncaught browser errors: zero. Horizontal overflow: zero at both tested widths.

Phase 7 report next, then stop without merge.

## Phase 7 — complete / stopped

report.md contains every product template/state's screenshot evidence, unchanged fixture evidence, features, rubric, verification results, research blocks, untested scope, and the full approval list. Seven phase commits; branch design/upgrade. No merge/deploy. Final review server may remain available at localhost:14747 for the fixture-only preview; original-UI and fixture-source processes can be stopped. Further building is a new scoped phase after this completed seven-phase upgrade.
