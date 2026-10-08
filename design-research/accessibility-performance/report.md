# Accessibility, responsiveness and recovery checkpoint

October 8, 2026. Branch `design/upgrade`. No merge or deployment. This phase is complete within the recorded test scope; manual VoiceOver is blocked and a multi-hour soak remains untested.

## Changes and reasons

- Light-theme accent changes from `#b94713` to `#b34512`: route hover text on `#f9eadf` improves from 4.495:1 to 4.730:1. This fixes a concrete contrast failure, preserving the existing design direction.
- Native PNG comparison runs in one reusable background worker, with a serialized queue. Expensive decoding, pixel matching and encoding no longer run on the review server thread. A failed job does not poison later jobs; every successful comparison retains separate snapshot URLs and original PNG bytes.
- Worker-side collection releases temporary decoded buffers after a job. The worker stops after 15 seconds idle, does not keep an idle CLI alive, and restarts for later comparisons. Reuse alone did not address the measured memory increase, so that version was not accepted as final.
- Review requests have a finite 120-second idle timeout instead of Bun's 10-second default, which interrupted a measured full-resolution comparison. Very large or queued comparisons can still exceed this limit; arbitrary scale is not claimed.

No dependency, file-format, API response, URL, baseline-promotion or database change. Canonical path checks and comparison thresholds are unchanged. Technical references: [Bun worker threads](https://bun.com/reference/node/worker_threads), [worker lifetime and messaging](https://bun.sh/docs/runtime/workers), [Bun memory measurement and collection](https://bun.sh/docs/project/benchmarking).

## Rendered contrast and browser recovery

`verify.ts` tests actual Chromium pages at 1280 and 390 pixels, in light and dark themes. Each of six route links is brought into view, hovered, and focused with the keyboard; background transitions finish before colors are sampled. Seventy-two link/count measurements all meet 4.5:1; minimum is 4.7297:1. Keyboard navigation scrolls the mobile index to its focused link.

Twenty-four scoped axe contrast runs have zero violations. Twelve repeated incomplete-rule instances remain because other links are offscreen or have single-character counts; they are recorded in contrast.json. Each affected label/count was independently exposed and measured. This resolves the previously unmeasured contrast scope without falsely describing axe's incomplete items as passes.

217 assertions pass. Four fresh page sessions exercise 48 alternating HTTP 503/network-aborted save attempts, exact-draft retry persistence, disabled export while unsaved, delayed responses with newer edits queued, snapshot expiry/refresh, persisted notes after reload, and idle-worker restart. All six comparison states are backed by actual generated image conditions, including malformed PNG and missing capture. No uncaught page errors or document overflow. The run lasted approximately 60 seconds, including a 16-second idle interval: repeated-cycle stress, **not** a multi-hour soak, crash recovery or proof that unsaved drafts survive closing the browser.

Screenshot inputs in this test are synthetic PNG fixtures. The pictures below are real-browser screenshots of the product interface, not screenshot mockups.

| Evidence | Desktop | Mobile |
| --- | --- | --- |
| Original light hover | [Before](evidence/routes-before-light-1280.png) | [Before](evidence/routes-before-light-390.png) |
| Light route navigation | [After](evidence/routes-light-1280.png) | [After](evidence/routes-light-390.png) |
| Dark route navigation | [After](evidence/routes-dark-1280.png) | [After](evidence/routes-dark-390.png) |
| Interrupted light save | [Failure](evidence/interrupted-save-light-1280.png) | [Failure](evidence/interrupted-save-light-390.png) |
| Interrupted dark save | [Failure](evidence/interrupted-save-dark-1280.png) | [Failure](evidence/interrupted-save-dark-390.png) |
| Recovered light session | [Recovery](evidence/recovered-light-1280.png) | [Recovery](evidence/recovered-light-390.png) |
| Recovered dark session | [Recovery](evidence/recovered-dark-1280.png) | [Recovery](evidence/recovered-dark-390.png) |

## Controlled mixed-resolution experiment

Twelve identical patterned PNG pairs: four each at 390×844, 1280×2400 and 2048×6144. Both implementations receive eight save requests per trial. One warmup and three measured trials run sequentially on this Mac, without another project benchmark running. The baseline is materialized read-only from commit `911c6b6`; generated files use ignored, isolated storage. Results include raw PNG hashes: all 12 statuses, ratios and baseline/difference hashes match exactly.

| Metric | Before, three trials | Final, three trials |
| --- | --- | --- |
| Longest save per trial | 3312 / 2094 / 3049 ms | 18.9 / 12.6 / 5.0 ms |
| Maximum event-loop delay per trial | 3287 / 1807 / 2467 ms | 35.1 / 29.0 / 30.8 ms |
| Full comparison time | 12.08 / 9.25 / 11.09 s | 7.81 / 15.27 / 10.39 s |
| End-of-trial resident memory | 923 / 662 / 632 MB | 705 / 588 / 918 MB |

The evidence supports a large improvement in foreground responsiveness on this fixture. It does **not** support uniformly faster comparisons or a peak-memory reduction. Worker creation/reuse without collection reached roughly 1.2–1.4 GB at trial end; intermediate measurements are preserved in profile-worker-per-request.json and profile-worker-reused.json. The final version returns end-of-trial memory to roughly the original range at the cost of collection work. RSS is not a leak diagnosis or a peak measurement. Host scheduling is uncontrolled; the baseline warmup experienced a long pause and is excluded by the same one-warmup rule. No production percentile, physical mobile performance, 1,000 tall-image baseline, or unbounded-memory guarantee is claimed.

Reproduce: `bun design-research/accessibility-performance/profile.ts before`, then `bun design-research/accessibility-performance/profile.ts after`, sequentially. Run browser recovery with `bun design-research/accessibility-performance/verify.ts`.

## Manual assistive technology: blocked

Loaded the owned local fixture in actual Chrome and inspected its accessibility tree. Review controls, labels and progress are exposed. VoiceOver Utility was inspected separately; its caption panel was already enabled, and AppleScript control remained disabled. Native Command-F5 and the accessibility-shortcut attempt did not activate VoiceOver. The targeted OS preference read returned `0` initially and finally, and no spoken/caption feedback was obtained. The temporary utility window was closed.

This is **not** a manual screen-reader pass. Actual VoiceOver reading order, announcements and screen-reader dialog use remain blocked by the available native controls. No security permission was enabled or changed. See [Apple's VoiceOver activation instructions](https://support.apple.com/guide/voiceover/turn-voiceover-on-or-off-vo2682/10/mac/27); activation was not verified here.

## Verification and review

74 unit tests / 12 files pass, including off-thread evidence, queued failure recovery and isolated snapshots. Typecheck passes. Lint exits 0 with the existing capture.ts:247 non-null warning. HTML build and CLI compilation with the worker entry pass. The standalone executable smoke check fails to resolve external `pngjs` under Bun's embedded filesystem; standalone packaging remains blocked. The source CLI starts the refreshed localhost:14850 preview successfully. No distributable-executable claim.

Lighthouse 13.5.0 in real Chrome for Testing scores 100 performance / 100 accessibility / 100 best practices for both mobile and desktop on the refreshed 12-capture source fixture. Raw reports are evidence/lighthouse-mobile.json and evidence/lighthouse-desktop.json. These fixture scores do not substitute for assistive-technology or large-library testing.

Manual source review: only comparison execution/lifetime, request timeout and the failing contrast token change. Existing PNG containment, immutable snapshot maps, finite thresholds and strict review persistence remain. Queue errors are contained and later jobs proceed. Worker dependencies stay local and no dynamic user-provided code executes. Remaining limits include transient high-resolution allocation, queued work after a client disconnect, packaged worker/assets resolution, physical devices, actual assistive technology and a multi-hour soak.

## Approval list

The full current needs-approval list is appended below. Nothing on it was implemented in this phase.

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
