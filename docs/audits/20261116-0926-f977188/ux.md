# ux audit, design-spine @ f977188

Run: 2026-11-16, AUDIT-ONLY, local. Surfaces: review UI (served by `bun src/cli.ts review`, synthetic 40-tile fixture, placeholder grey screenshots) and static site (`python3 -m http.server`). Playwright, Chromium only. Persona lens: first-time developer, impatient scanner, mobile one-thumb, returning reviewer.

Flow coverage: first touch (site), core action (approve/reject, inspect), failure (API down, save failure), empty (search with no match), zero-data. Entry/onboarding and signup are N/A (no accounts). Return (second visit): the UI persists decisions in `review.json`; reload behaviour not driven (partial).

## Findings

| ID | Sev | Conf | Location | Problem | Impact | Fix | Rung |
|---|---|---|---|---|---|---|---|
| UX-001 | Medium | High | `#lightbox` `.viewer-canvas`, `src/ui/review.css` (lightbox layout, max-width 700px rules) | At 390x800 the screenshot being judged gets 200px of 800px height; the toolbar, finding chips and decision bar take the rest. At 1440x900 it gets about 435px. | The core act (judging evidence) is done on the smallest part of the screen; phone/tablet review means constant scrolling inside nested scroll areas. | Collapse the comparison controls and diagnostics under a disclosure on narrow screens, or pin the decision bar and let the canvas fill the rest. | 4 (`shots/ui-lightbox-390.png`, measured canvasH 200) |
| UX-002 | Low | High | `src/ui/review.js:1717-1718` | Pressing `a` or `r` before any tile is focused does nothing and says nothing (approved count unchanged, `#save-status` empty). Shortcut legend is 11px mono grey at the right edge of the results row (`.keys`). | A new user trying the headline feature (keyboard review) gets silent failure and may conclude it is broken. | Auto-focus the first pending tile on load, or announce "Press j to pick a tile first". | 4 |
| UX-003 | Low | High | load-failure panel (`#cards`), `shots/ui-error-api-down-1440.png` | Failure copy reads "Could not load this run. Failed to fetch Check that the review server is running, then retry." The browser's raw "Failed to fetch" is spliced in without punctuation. | Jargon and a run-on sentence at the moment trust is lowest. The retry button and next step are good. | Drop the raw error or separate it ("Details: Failed to fetch."). | 4 |
| UX-004 | Low | High | `nav#route-nav` sidebar | Long route `/projects/a-very-long-project-name/releases/review-workflow-improvements` hard-wraps mid-word ("releases/r" / "eview-workflow-") in a 167px column and takes 130px height. | Hard to scan; looks like a bug. | `overflow-wrap: anywhere` with a middle-ellipsis or title attribute, or `word-break: break-word` at slashes only. | 4 (`shots/ui-fold-1440.png`) |
| UX-005 | Low | Medium | site hero, `site/index.html` hero row | Hero offers two actions with equal weight (a copy-command chip and "Read the quick start") and no direct link to the repo or the live review demo; the GitHub link is the last item in the nav. The "Try a review" demo sits roughly 80% down the 9,600px page. | Skeptical scanners see the category (Next.js, local) in the lede but not proof until the filmstrip; the strongest conversion proof is far below the fold. | Link "Try a review" from the hero, and add a repo/star link beside the install chip. | 3 |

## States triggered in the browser

| State | Result |
|---|---|
| Loading | Present: "Loading your captures..." with `aria-busy` (seen in source `index.html`; brief at runtime) |
| API down | Triggered: clear panel, status "Unable to load captures", Retry button (UX-003 copy) |
| Save fails | Triggered: "Changes could not be saved. Your drafts remain here; retry before leaving." plus Retry. Tile shows as approved optimistically while unsaved; message is explicit. Good. |
| Empty search | Triggered: "No captures match. ... Your review decisions are still saved." plus Clear filters. Good. |
| Coverage gaps | Present: summary "40 of 41 planned tiles captured, 1 unfinished". |
| Offline mode / slow network | not covered |
| Site demo error/empty | not covered |

## Persona notes
- Impatient scanner (UI): header, stats, progress and "Next pending" give an immediate path. Approve/reject on the card are one click and one key.
- Non-technical user: UI vocabulary (baseline, threshold 0.20%, structure changed) is expert-level. Acceptable for a developer tool.
- Mobile (UI): usable at 390 without overflow; lightbox is the weak point (UX-001).
- Returning user: decisions persist, `Next pending` resumes. Not driven across a reload.

## Summary
- Biggest UX risk: UX-001 (judging screenshots on small screens) and the silent no-op of keyboard review for a new user (UX-002).
- Biggest conversion opportunity missed: link the interactive "Try a review" demo and repo from the hero (UX-005).
- Worst-issue screenshots: `shots/ui-lightbox-390.png`, `shots/ui-error-api-down-1440.png`, `shots/ui-fold-1440.png`.

## Not covered
Real captures, large runs and pagination, `Export` / `Offline report` output, diff/overlay/blend modes, the note and anchor flows, the site's demo submit, offline, Firefox/WebKit/real phone, return-visit reload.
