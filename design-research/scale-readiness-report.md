# Scale and capture-readiness results

Implemented on design/upgrade. Main, production, existing example data, existing baselines, and original fixture reviews remain untouched. Design decisions and the additive read-only API contract are in scale-readiness-plan.md.

## Delivered

48-capture pages with controls at both ends, global search and progress, route jumps to the appropriate page, keyboard navigation across pages, full-library viewer navigation, and full-library export. Drafts and failed saves survive page changes. Visible Previous/Next labels fit mobile controls; accessible names remain Previous page/Next page. Only the top page counter announces changes to avoid duplicate announcements.

The desktop route index scrolls within the viewport so long route lists remain reachable alongside the review. Mobile keeps its horizontal route index.

Progressive comparison loading makes captures available before PNG comparison finishes. The server yields between pairs so saves remain responsive. Pending/ready/error/retry states are explicit. Comparison completion updates existing labels without replacing the active note field. Export waits for pending evidence; a failed comparison is explicitly marked unavailable in the report.

Capture now waits up to three seconds for fonts and image decoding after scrolling. Actual captures include the delayed lazy-image pixels in both themes. Timeout uses the existing warning field; broken images remain failures in diagnostics. Warning cards no longer also claim Checks clear. Animation defaults remain unchanged.

## Measured results

Chromium, 1280/390px, 4× CPU throttle. Synthetic captures use the project's own demo PNGs and unique IDs/routes. The previous UI was read from commit fcca553 and served through browser interception, not reconstructed. Before/after JSON contains 100, 500, and 1,000 cases. These are local single-pass observations, not production percentiles or physical-device measurements.

| 1,000-capture measurement | Desktop before → after | Mobile before → after |
| --- | --- | --- |
| First render observed | 596.8 → 193.0 ms | 522.6 → 185.5 ms |
| Clearing search, synchronous handler | 94.9 → 7.7 ms | 72.8 → 7.8 ms |
| Rendered capture cards | 1,000 → 48 | 1,000 → 48 |
| DOM elements | 17,287 → 1,051 | 17,287 → 1,051 |

Sources: scale-before.json, scale-after.json, measure-scale.ts, scale-baseline-ui.html. First-render timing observes completion after the browser detects the loaded cards; filter timing measures synchronous event work separately.

Server baseline comparison initially took 342.6 ms for 10 pairs, 1,212.7 ms for 50, and 2,139.8 ms for 100. Fixture: distinct files copied from the same generated 390px capture, with identical baselines. Source: comparison-scale-measurement.json. This exposed a separate bottleneck from DOM rendering.

With progressive loading, the 100-pair real-server test displayed captures in 211.7 ms, responded to a concurrent save in 35.8 ms, and finished comparison in 1,904.0 ms. Work is now available while comparison continues; total comparison computation has not been eliminated. Source: progressive-checks.json.

## Capture experiment

The original wait/scroll recipe reproduced on a generated delayed-image/motion page captured while its image was incomplete (naturalWidth 0). After asset readiness it had naturalWidth 240. Repeated screenshots under the original animation policy differed by ratio 0.002135, above the CLI default 0.002; disabling animations in the experiment produced ratio 0. This is evidence from one deliberately unstable generated page, not a claim about all sites.

The investigation used the capture recipe in a browser, not the runCapture function. The subsequent verification invoked actual runCapture and checked that green pixels from the delayed lazy image were present in both theme PNGs. Empty/broken assets, bounded image timeout, pending font timeout, and failed-font fallback also passed. Source: capture-stability-investigation.json and capture-readiness-checks.json. Animation disabling was experimental only and is now in needs-approval.md.

## Browser evidence and design assessment

All screenshots below are genuine Chromium captures under screenshots/after:

- scale-before-1280.png / scale-before-390.png and scale-after-1280.png / scale-after-390.png: previous/current large-library review.
- paging-1280.png / paging-390.png: page navigation with a retained failed draft.
- comparison-progressive-pending.png / comparison-progressive-ready.png and pending-1280/390 variants: the same active draft before/after completion.
- comparison-progressive-error-1280.png / comparison-progressive-error-390.png: recovery states.
- stability-current-first/second.png and stability-disabled-first/second.png: experimental recipe evidence. Tall images contain the below-fold delayed image.
- readiness-capture-light.png / readiness-capture-dark.png: actual runCapture output with the decoded delayed image.

First inspection found mobile page-button wrapping and unbounded rendering as craft concerns (3/5). Refined controls have short visible labels, stable reserved comparison status space, and bounded rendering. Final rubric: point of view 4; typography 4; layout/rhythm 4; color/imagery 4; motion 4; audience fit 5; memorability 4; craft 4. Design judgments refer to loaded, inspected screenshots; no decorative motion was added to a working review tool.

## Verification and remaining scope

- 41 unit tests pass, including cooperative comparison processing and existing comparison safety tests.
- 72 existing desktop/mobile browser checks, 32 comparison checks, 26 paging checks, 12 progressive-load checks, and 8 capture-readiness checks pass.
- Paging accessibility in light/dark at both widths has zero violations. Comparison-phase axe results remain recorded, including the existing incomplete mobile route-link contrast item. No full manual screen-reader audit is claimed.
- Typecheck, lint, HTML build, and CLI compile pass. One pre-existing non-null assertion warning remains, now at capture.ts:237 because the helper precedes it. No packaged distribution claim.
- Updated original preview Lighthouse mobile/desktop: 100 performance / 100 accessibility / 100 best practices. Files: lighthouse-comparison-mobile/desktop.json. Large-run observations come from the separate throttled browser test, not these Lighthouse scores.

The server still performs each individual PNG comparison synchronously, and large/high-resolution images may take longer than tested pairs. A diverse real 1,000-baseline library and physical low-end devices remain untested. Four recent comparison snapshots are retained; older tabs may need reload. Capture asset waiting is bounded; it does not make the entire navigation/screenshot pipeline a three-second operation.

Approval list remains in needs-approval.md: new persistent metadata/history, hosted services/accounts/sharing, paid integrations/keys, destructive changes, automatic baseline promotion, and now a possible forced animation policy. No approval-dependent change was made.
