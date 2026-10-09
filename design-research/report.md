# Design Spine upgrade report

Completed October 8, 2026 on `design/upgrade`. No merge, deployment, production access, schema migration, route change, paid integration, or capture deletion.

Latest revalidation: [October 9 current-source browser and audit results](revalidation-2026-10-09/report.md). No additional application changes.

Previous checkpoint: [accessibility and responsiveness report](accessibility-performance/report.md). It adds measured route-hover contrast repair and background native-image processing, verifies 217 browser assertions and 74 unit tests, and records blocked VoiceOver/standalone packaging plus untested long-duration and physical-device work. Earlier metrics below describe their original phases.

## Outcome

Design Spine now presents screenshot evidence in an indexed local review workspace: a warm paper/ink palette with an orange identity mark, readable screenshot wells, a coherent type and spacing system, a route index, prominent progress, and usable mobile controls. The interface follows OS light/dark preference independently of the captured screenshot theme. Fonts stay local; there are no new production dependencies.

The sole product page is `/`. The capture fixture pages are intentionally imperfect inputs, not business pages; they were loaded and captured, but their defects and content remain intact.

## Features added and preserved

- Search routes and states; filter by review verdict, arbitrary captured width, capture theme, flagged and unreviewed; clear combined filters; route links recover targets hidden by filters.
- Counts and review progress, explicit pending/approved/rejected labels, completion indication, next-pending navigation. Automatic checks never masquerade as human approval.
- Accessible screenshot dialog with fit/actual size, previous/next, arrow navigation, download, Escape close, focus return, and keyboard-scrollable evidence.
- Confirmed save feedback, serialized writes per tile, failed-write recovery, draft retention through filtering, retry using the latest intended note, and navigation warning for unsaved work.
- Local JSON report download with the full run, confirmed decisions/notes, and critiques; export disabled until all edits are saved.
- Loading, load failure/retry, empty run, no results, missing screenshot, save success/failure, completion, critique pass/fix/error, and detailed diagnostics/warnings.
- Existing approve/reject toggles, keyboard shortcuts, partial note updates, local persistence, route/state grouping, automatic capture diagnostics, optional critique, and explicit CLI baseline workflow preserved.

## Before / after evidence

Every screenshot below is from a real Playwright browser. The full review comparisons include every captured route/state group. Desktop is 1280×900; mobile is 390×900. Full-page images extend beyond those viewport heights. First-fold screenshots provide easier visual comparison. Fault states use controlled request interception; persistence was also tested against a real isolated server and disk files.

| Template/state | Before desktop / mobile | After desktop / mobile |
| --- | --- | --- |
| Review `/`, all groups | [Desktop](screenshots/before/review-1280.png) / [Mobile](screenshots/before/review-390.png) | [Desktop full](screenshots/after/final-review-1280.png) / [Mobile full](screenshots/after/final-review-390.png); [desktop fold](screenshots/after/final-viewport-1280.png) / [mobile fold](screenshots/after/final-viewport-390.png) |
| Screenshot viewer | [Desktop](screenshots/before/viewer-1280.png) / [Mobile](screenshots/before/viewer-390.png) | [Desktop](screenshots/after/viewer-1280.png) / [Mobile](screenshots/after/viewer-390.png) |
| Empty run | [Desktop](screenshots/before/empty-1280.png) / [Mobile](screenshots/before/empty-390.png) | [Desktop](screenshots/after/empty-1280.png) / [Mobile](screenshots/after/empty-390.png) |
| No results | Previously shared the generic empty message | [Desktop](screenshots/after/no-results-1280.png) / [Mobile](screenshots/after/no-results-390.png) |
| Loading | Previously blank capture area | [Desktop](screenshots/after/loading-1280.png) / [Mobile](screenshots/after/loading-390.png) |
| Load error/retry | Previously unhandled fetch error, no recovery | [Desktop](screenshots/after/load-error-1280.png) / [Mobile](screenshots/after/load-error-390.png) |
| Saved | Previously silent confirmation | [Desktop](screenshots/after/saved-1280.png) / [Mobile](screenshots/after/saved-390.png) |
| Failed save/retry | Previously silent failure, no retained retry workflow | [Desktop](screenshots/after/save-error-1280.png) / [Mobile](screenshots/after/save-error-390.png) |
| Complete review | Previously counters only | [Desktop](screenshots/after/complete-1280.png) / [Mobile](screenshots/after/complete-390.png) |
| Missing screenshot | Previously broken image element | [Desktop](screenshots/after/missing-image-1280.png) / [Mobile](screenshots/after/missing-image-390.png) |
| Diagnostics and critique states | Previously basic badges/critique with tooltip-only raw errors | [Desktop](screenshots/after/diagnostics-1280.png) / [Mobile](screenshots/after/diagnostics-390.png) |
| Dark interface | Original followed OS dark preference; baseline captures are light | [Desktop](screenshots/after/dark-review-1280.png) / [Mobile](screenshots/after/dark-review-390.png) |

Preserved fixtures have actual before evidence at both widths/themes. They are unchanged after the upgrade:

| Fixture template | Desktop light / dark | Mobile light / dark |
| --- | --- | --- |
| `/` | [Light](screenshots/before/fixture-home__ideal__1280__light.png) / [Dark](screenshots/before/fixture-home__ideal__1280__dark.png) | [Light](screenshots/before/fixture-home__ideal__390__light.png) / [Dark](screenshots/before/fixture-home__ideal__390__dark.png) |
| `/cards` | [Light](screenshots/before/fixture-cards__ideal__1280__light.png) / [Dark](screenshots/before/fixture-cards__ideal__1280__dark.png) | [Light](screenshots/before/fixture-cards__ideal__390__light.png) / [Dark](screenshots/before/fixture-cards__ideal__390__dark.png) |
| `/about` | [Light](screenshots/before/fixture-about__ideal__1280__light.png) / [Dark](screenshots/before/fixture-about__ideal__1280__dark.png) | [Light](screenshots/before/fixture-about__ideal__390__light.png) / [Dark](screenshots/before/fixture-about__ideal__390__dark.png) |

## Rubric

All final product templates/states score **4/5** on point of view, typography, layout/rhythm, color/imagery, motion, audience fit, memorability, and craft. These are explicit local assessments, not external awards or independently verified taste ratings. Details and two foundation screenshot/fix rounds are in [scores.md](scores.md). Initial readability, mobile filter, viewer layout, save retry and keyboard scrolling weaknesses were corrected and retested.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Tests | 35 passing in 8 files |
| Lint | Exit 0; existing warning at `src/lib/capture.ts:216` preserved |
| Builds | Bun HTML build and CLI compilation with external packages passed |
| Browser journeys/states | 70 checks passed; no uncaught errors; no horizontal overflow at both widths |
| Real API/disk persistence | 6 checks passed: validation, partial save, reread, toggle preservation, traversal rejection |
| Axe | Zero violations and zero incomplete checks in 8 review/viewer × width × theme combinations |
| Lighthouse mobile | Before 90 performance / 100 accessibility / 92 best practices → **100 / 100 / 100** |
| Lighthouse desktop | Before 83 performance / 100 accessibility / 96 best practices → **100 / 100 / 100** |
| Layout shift | Mobile 0.207 → 0.029; desktop 0.337 → 0.005 |

Lighthouse 13.5.0 ran in real Chrome for Testing, sequentially for comparisons; metrics apply to the isolated 12-capture fixture library. Raw Lighthouse, browser, accessibility, and persistence JSON reports are in this directory. Generated tooling cache and build artifacts are ignored. No dependency or lockfile change was necessary.

## Blocks, limits and untested work

- Godly redirected to Recent's social-feed gallery; its former live-site reference format was unavailable. Land-book entry pages returned browser challenge responses. Both are documented in references.md. Twelve live reference sites were still loaded and captured; four SOTD awards were verified in genuine browser entry pages. Nine public peer pages were researched. Authenticated competitor product screens were not accessed.
- No paid integration, hosted collaboration, database change, new persistent annotation model, arbitrary real project run, production capture, or baseline promotion was tested or implemented.
- Existing example capture data was not inspected or edited. Diagnostic fixture defects were preserved.
- Browser automation used Chromium. Safari, Firefox, manual screen-reader testing, huge capture libraries, concurrent reviewers in separate tabs, and end-to-end external Claude critique remain untested. Automated accessibility results do not establish complete WCAG conformance.
- Existing Biome configuration excludes the inline UI; it is checked through real browser execution and axe rather than claiming UI lint coverage. The unrelated capture-code warning remains.
- There is no existing package build script. A naive all-dependency CLI bundle initially failed on Playwright's optional chromium-bidi imports. The successful CLI compile externalizes packages; standalone redistributable packaging and bundled HTML asset resolution are not claimed.

## Full needs-approval list

Not implemented:

- Hosted accounts, team collaboration, cloud capture storage, paid visual testing integrations, and API keys: introduce services, cost, and data-boundary decisions.
- New persistent run metadata, CMS/schema changes, or database migrations: not needed for the chosen local review workflow.
- Removing or restyling intentionally imperfect demo fixture pages: would weaken capture diagnostics; preserved.
- Deleting existing captures, baselines, or example data: preserved.
- Changing existing routes or automatically promoting screenshots to baselines: preserved existing explicit CLI workflow.

No destructive or production changes are authorized or planned. The same list is maintained in [needs-approval.md](needs-approval.md).

## Stop state

All seven phases completed with a commit per phase. Remains on `design/upgrade`; no merge or deployment. Review preview uses only generated fixture evidence at localhost:14747. The requested upgrade is complete; future product work can use the report and progress file to choose a separately scoped addition.
