# Field validation — October 9, 2026

Implemented on `design/upgrade`, application changes committed as `46e1af5`. No merge or deployment. The recommended real-project and sustained-scale checks are complete within the recorded scope. Native keyboard checks pass; actual VoiceOver remains blocked. Idle resident memory remains an investigation item.

## Outcome and changes

Large screenshot batches could retain several gigabytes of temporary decoded image buffers. The corrected reproduction crosses the 2.5GiB test ceiling before the first comparison completes. Compressed inputs total less than 6MiB. Synchronous collection after every four tiles still crosses the ceiling; yielding the worker between image groups, then collecting, allows the 240-pair test to complete repeatedly. The CLI's equivalent synchronous loop reproduces the same failure and receives the same bounded processing change.

Comparison thresholds, pixel results, PNG bytes, URLs, stored formats, explicit baseline promotion and dependencies remain unchanged. The synchronous comparison remains the reference for regression checks. This is a reduction in observed large-run memory demand, not elimination of all memory concerns or proof of uniformly faster comparisons. The implementation uses existing [Bun worker lifetime facilities](https://bun.sh/docs/runtime/workers) and [synchronous collection](https://bun.com/reference/bun/gc); the need to yield is an inference supported by the controlled failed/successful variants, not a claim about every runtime's allocator internals.

## Real project

Used Liz-owned Create Surveys, verified by sanitized GitHub remote `forbiddenlink/create-surveys` and a fresh anonymous load at 127.0.0.1:4174. The pre-existing Chrome tab showed stale CryptoViz content while a fresh context served Create Surveys; no CryptoViz validation claim is made. The live local development build was not pinned to a source commit.

Captured `/`, `/templates`, `/try`, `/help`, `/login`, `/forgot-password` at 390/1280px and both media themes: 24 actual browser captures. No capture failures, console/page errors, document overflow or broken images. Theme contexts are recorded; no claim that every page changes its appearance with OS theme.

26 CLI/browser workflow checks pass: capture → combined search/filter → inspect → decision and exact note persistence → export → reload → explicitly promote one isolated baseline → unchanged diff → controlled changed-copy diff. Original capture and baseline bytes remain identical. The approved note explicitly identifies workflow validation, not production sign-off. No login, app form submission, private survey access, app source edit or original project baseline change occurred.

The capture and review roots are isolated under this directory's ignored `.design-spine/runs/`. Persisted verification exports and browser screenshots are committed alongside the reports.

## Scale and memory evidence

| Check | Outcome | Memory observation |
| --- | --- | --- |
| Corrected pre-fix review reproduction | Stops at test ceiling before first comparison finishes | 2,579 MiB sampled RSS |
| Collection without worker yielding | Still stops at ceiling | Preserved in collection-only-soak-results.json |
| Short yielding check | 2 comparisons, 39 verified saves | About 1,341 MiB sampled peak |
| Pre-fix CLI | Child stopped at ceiling | 2,577 MiB OS-sampled peak |
| Fixed CLI | All 240 rows; expected exit status; sampled PNG hashes/ratios match worker | 1,355 MiB OS-sampled peak |
| Final isolated sustained run | 31 full comparisons, 612 verified save/read operations, no failures | 1,636 MiB sampled peak |
| Real-capture replica cross-check | 240 unchanged results, 24 unique baseline hashes verified, 11 exact disk-confirmed saves | 921 MiB sampled peak |

The sustained run lasted 20.42 minutes. Each batch has 240 pairs: 180 at 390×1800, 48 at 1280×2400 and 12 at 2048×6144. These use three repeated patterned image types. All 240 statuses are checked per batch; baseline/difference hashes for six representatives covering all three types remain identical across repeats. Save/read round trips have local median 2.28ms and maximum 66.66ms. Maximum observed main-loop timer delay is 58.90ms. Complete batch times range from 30.73–82.32s. Host scheduling is uncontrolled; these are not production percentiles.

The separate real-content run uses ten copies of each of the 24 actual captures, not 240 unique pages. It confirms zero pixel changes across all replicas and exact original baseline bytes for all 24 unique images. Its 38.64s elapsed time includes a 16-second idle probe and is not a comparison-only benchmark. Its first successful run is separately preserved in real-scale-initial-results.json.

Memory is sampled every 100ms; exact allocation peaks are not established. Reported peak grows during the sustained run, so this is not a flat-memory or leak-free claim. In the real-capture OS cross-check, resident memory remains 921 → 921 → 921 MiB before idle, after the 16-second worker-idle interval, and after explicit main-thread collection. Bun and OS readings agree at these checkpoints. No meaningful return to starting resident memory was observed. Further native allocation/allocator profiling and a longer multi-hour run are warranted; idle footprint remains unresolved. The fixture safety ceiling is a test guard, not a product memory guarantee.

## Recovery, accessibility and checks

217 fresh browser assertions pass, including 48 alternating HTTP/network save failures, exact draft retries, newer queued edits, comparison expiry/refresh, reload persistence, worker restart and rendered route contrast at both widths/themes. Scoped axe violations are zero; incomplete items remain recorded separately in recovery/contrast.json. Direct rendered contrast measurements do not convert incomplete automated items into automated passes.

Native Chrome keyboard checks pass for the skip link, main focus, j/Enter inspection, arrow navigation, Escape and selected-card focus return. VoiceOver app launch timed out and the normal shortcut did not activate it. The targeted OS preference remains off on the final check; no speech/caption feedback was obtained. AppleScript control remains disabled and no security permission was changed. This is **not** a manual screen-reader pass. Utility close/quit attempts did not confirm dismissal; no successful cleanup claim is made.

75 tests in 12 files, typecheck, lint and the HTML build pass sequentially. The existing capture.ts:247 non-null assertion lint warning remains. Source CLI execution is exercised from outside the checkout against isolated roots. Standalone packaging was not retested or changed. Earlier Lighthouse results remain historical and are not presented as a new audit of this phase.

The initial exploratory harness incorrectly expected all small changes to exceed threshold and failed to stop an active comparison immediately. Its raw evidence is preserved as initial-*. The corrected ceiling reproduction and periodic-collection-only failure are separate. One overlapping heavy test run produced timeouts; contended-*.json is excluded from final passing results. Sequential verification replaced those claims. See reasoning.md for the investigation.

Two independent read-only reviews of pinned commit 46e1af5 found no actionable standards or specification issues. See review.md; those reviewers did not run benchmarks or establish memory bounds.

## Browser evidence

| View | Desktop | Mobile |
| --- | --- | --- |
| Final fresh review preview, light | [Screenshot](preview-light-1280.png) | [Screenshot](preview-light-390.png) |
| Final fresh review preview, dark | [Screenshot](preview-dark-1280.png) | [Screenshot](preview-dark-390.png) |
| Actual app screenshot inspection | [Viewer](real-viewer-1280.png) | [Viewer](real-viewer-390.png) |
| Confirmed real-app review state | [Review](real-review-1280.png) | [Review](real-review-390.png) |
| Interrupted save recovery | [Recovery](recovery/recovered-light-1280.png) | [Recovery](recovery/recovered-light-390.png) |

Each captured public app page has an `app-<route>__ideal__<width>__<theme>.png` pair here. Exports: real-export-1280.json and real-export-390.json. Full assertions, comparison evidence, timings and checkpoints remain in the adjacent JSON files. Fresh source preview: http://localhost:14870, using isolated real-app evidence.

## Limits and stop state

Actual VoiceOver, physical-device/Safari/Firefox checks, high-entropy photographic libraries, multi-hour stability, native allocation attribution and standalone distribution remain blocked or untested. The tested 240-pair workload does not prove arbitrary-scale safety. No real baseline or production change was made. Stop after the final evidence commit; no merge or deployment.

## Full approval list

No new approval-requiring change was introduced. Existing list follows unchanged.

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
