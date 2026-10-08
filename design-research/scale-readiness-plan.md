# Scale and capture-readiness phase

User requested continued building and emphasized excellence in functionality, design, and the overall experience. Scope: measure large review libraries, remove measured interaction bottlenecks, preserve review work, and investigate screenshot reliability. All fixtures are generated from this project's own demo evidence. No external accounts, services, keys, migrations, content deletion, or automatic baseline promotion.

## Decisions

- Render 48 matching captures per page. Prefer explicit, keyboard-accessible pages over scroll virtualization: native focus, notes, browser inspection, and semantic route/state sections remain straightforward. Navigation appears above and below captures. Search, progress, route index, viewer navigation, and export still operate on the full filtered library.
- Move comparison work behind progressive loading. Keep the existing GET /api/run contract by default. The UI requests GET /api/run?compare=false for immediate run/review/critique, then GET /api/comparison for the same computed evidence report. Comparison processing yields between PNG pairs so another request can save notes. Stored formats and comparison image endpoints remain unchanged.
- Show pending, ready, failure, and retry explicitly. Disable changed-only filtering and export while comparison is pending. Captures and review actions remain usable. A failed comparison can be retried; an export after failure explicitly marks comparison unavailable. Completion updates labels and viewer controls without rebuilding note fields, preserving focus and text.
- After the existing full-page scroll, wait for document.fonts.ready and image decoding for up to three seconds before collecting metrics and screenshots. Failed image decodes settle and remain visible to broken-image diagnostics. Timeout adds an existing non-fatal capture warning. Do not force animations off: the experiment proves that changes capture semantics, so it is listed for approval.
- Warning cards must not simultaneously show Checks clear. Keep the existing distinction between diagnostic flags and non-fatal warnings; tests explicitly preserve that distinction.

## Verification

Measure 100/500/1,000 synthetic captures in Chromium at 1280/390px with 4× CPU throttling. Compare the committed previous UI loaded in the real browser with the new UI. Separate first-render observations from filter durations. Verify page boundaries, route jumps, failed drafts, retry, full-library export, and viewer/keyboard navigation across pages.

Measure baseline comparison separately, then verify core loading and concurrent saves against an isolated server with 100 PNG pairs. Test comparison failure/retry at desktop/mobile widths. Test asset wait success, empty and broken assets, image timeout, pending fonts, fallback fonts, and actual capture PNG pixels. Recheck all existing journeys, comparison accessibility, tests, typecheck, lint, builds, and Lighthouse.

## Limits

Browser measurements simulate slower CPU on this Mac, not a physical low-end phone. Synchronous work within one PNG pair still exists; yielding avoids blocking the entire run but does not parallelize image processing. Four comparison evidence snapshots remain the retention limit. Very large images, diverse real-world 1,000-baseline libraries, manual assistive technology, animated GIF stabilization, and real font-layout visual regressions remain untested. No new persistent capture metadata is introduced.
