# Follow-up research — 2026-10-08

Seven public primary-source pages and the local review were loaded in Chromium at 1440 × 1000; all returned HTTP 200. Their followup-*.json files record final URLs, text, and links; screenshots are in screenshots/references/. These were public product pages and documentation, not authenticated customer workspaces. No services, accounts, keys, baseline updates, or production changes.

## Findings from loaded sources

| Source | Screenshot | Relevant pattern |
| --- | --- | --- |
| [Chromatic review](https://www.chromatic.com/docs/review/) | followup-chromatic-review.png | Baseline and branch snapshots appear within the review workflow, alongside discussion and reviewer state. |
| [Chromatic Diff Inspector](https://www.chromatic.com/docs/diff-inspector/) | followup-chromatic-diff.png | Split and overlaid comparison, change highlights, and zoom help inspect subtle differences. Rapid strobing should not be copied into the default experience. |
| [Percy visual testing](https://www.browserstack.com/docs/percy/overview/visual-testing-basics) | followup-percy-workflow.png | Build context and baselines accompany decisions. Unchanged requested changes can carry forward; new differences need review. |
| [Argos Diff](https://argos-ci.com/diff) | followup-argos-diff.png | Baseline context, screenshot metadata, and structured diff evidence support decisions. Capture stabilization is also documented. |
| [Argos Review](https://argos-ci.com/review) | followup-argos-review.png | Explicit verdicts and contextual comments create an auditable review. Hosted roles and notifications are not prerequisites for this local tool. |
| [Argos Stabilize](https://argos-ci.com/stabilize) | followup-argos-stability.png | Recurring visual differences are distinguished from new regressions. This does not establish that Design Spine's fixtures are flaky. |
| [Playwright screenshot API](https://playwright.dev/docs/api/class-page#page-screenshot) | followup-playwright-capture.png | Screenshot animations default to allowed. Disabling animations completes finite animations and resets infinite animations during capture, changing capture semantics. |

## Local screen assessment

The captured local review has readable hierarchy, consistent controls, route indexing, and useful screenshot space. Its biggest remaining gap is deciding whether to approve without seeing a baseline or highlighted difference. Evidence: screenshots/references/followup-local.png. This assessment is limited to the 12-capture generated fixture; large runs remain untested.

## Confirmed bug and focused repair

The upgraded editor allowed 20,000 characters (src/ui/index.html:301), while src/lib/server.ts:55 persisted at most 2,000. In an isolated browser run, entering 2,500 characters saved 2,000, retained 2,500 onscreen, disabled Export, and reported that other drafts needed saving. The extra text remained a browser draft and was not fully persisted.

The editor now matches the existing 2,000-character server limit and visibly explains the limit and save trigger. No endpoint or stored schema changed. At 1280px and 390px, attempted entry of 2,500 characters accepts 2,000, persists all accepted text, reports all changes saved, and enables Export. Original fixture reviews were untouched.

Before evidence: followup-note-investigation.json and screenshots/references/followup-note-limit.png. After evidence: followup-note-verification.json, followup-note-verification-mobile.json, and followup-note-limit-fixed desktop/mobile screenshots. Repeat with `bun design-research/investigate-notes.ts --verify [--mobile]`. The original short-note checks missed this boundary condition.

## Ranked next work

1. **Baseline/current/diff inspection — high impact.** src/cli.ts:189 already generates comparison rows, changed ratios, size changes, and diff PNGs. src/lib/server.ts:20 exposes only run/review/critique. The viewer at src/ui/index.html:180 shows the current image alone. Expose existing comparison evidence read-only and provide split view and a static overlay. Handle absent baseline/comparison, capture failure, and size mismatch explicitly. Never stretch differently sized images to conceal a layout change. Keep baseline promotion in the explicit CLI command.
2. **Changed-first triage — high impact.** Display comparison states separately from diagnostics and review verdicts. Add Only changed with actual new/changed/unchanged/size-changed/unavailable evidence. A warning flag does not prove a visual regression. Preserve existing filters and shortcuts.
3. **Baseline provenance — high impact.** The approval command already records run and approvedAt in the baseline manifest (src/cli.ts:180). Show that existing provenance and the comparison threshold. Do not infer branch, commit, browser, or environment fields that the run does not store.
4. **Capture readiness investigation — medium/high impact.** src/lib/capture.ts:194 uses reduced motion; lines 205–222 wait for navigation/network idle, scroll, then capture. No explicit font-ready wait or disabled screenshot animation option is present. Test delayed fonts/images and motion in a generated fixture and measure repeated captures before changing behavior. Network idle alone is not a complete readiness contract. No capture semantics changed in this pass.
5. **Large-run usability investigation — medium impact.** Current render rebuilds visible tiles (src/ui/index.html:312). Measure 100/500/1,000 generated captures for initial render, filtering, keyboard navigation, scrolling, and draft retention. Consider paging or virtualization only if measurements justify it. Previous 12-capture performance scores do not answer this question.

## Boundaries and unknowns

The first three recommendations can consume existing local artifacts without changing stored schemas. An additive read-only API still needs a concrete contract and path validation before implementation. No comparison endpoint was added here.

New persistent browser/commit/readiness/history fields require approval. Hosted reviewers, cloud sharing, notifications, accounts, and paid integrations remain approval items. No automatic baseline promotion, broad ignore regions, or fixture deletion is proposed.

Authenticated competitor workspaces, large-run performance, repeated-capture stability, and manual screen-reader use remain untested. Documentation examples are not hands-on proof of hosted product behavior.

## Verification

35 unit tests passed; TypeScript passed; lint exited successfully with the unchanged capture.ts:216 warning; HTML build passed. Desktop/mobile real-server note boundary checks passed. Accessibility results are in accessibility-checks.json. Lighthouse was not rerun for the note-only change; previous scores remain historical measurements.
