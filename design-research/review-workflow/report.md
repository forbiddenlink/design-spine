# Review workflow features — October 9, 2026

Implemented on `design/upgrade`. Feature checkpoint c98d748; reviewed fixes e9dce3e. No merge or deployment.

## Outcome

Reviewers can approve/reject, toggle back to pending, edit/save notes, retry failed changes and move to the next pending screenshot directly from inspection. Decisions include the current note draft. Explicit note saving avoids losing a decision click to blur-triggered button disabling. Drafts survive navigation and closing; confirmed cards and exports remain synchronized.

A comparison selector exposes all six existing evidence states: new, changed, dimensions changed, within threshold, no capture and unavailable. It combines with search/viewport/theme/review filters. Exact selection and the existing broad Only changed shortcut clear one another so they cannot accidentally contradict each other. Loading/failure disables comparison selection; retries restore it. No automatic approval or baseline changes.

When a saved decision leaves the filtered set, inspection advances to the next surviving neighbor. Identity-based selection also works when retrying multiple failed decisions. After navigating across capture pages, closing restores focus to the viewed screenshot on its correct page; returning to the same screenshot preserves the inspection-button focus.

## Verification

- **164 new real-browser assertions** across 1280/390px and light/dark: all six actual comparison states; combined filters; comparison loading/failure/retry; viewer decisions and undo; exact disk persistence; draft navigation/close; failed decisions/retries; newer edits during pending saves, including restoration of the original saved note; full 2,000-character note persistence; next pending; single/multiple filtered retry removals; last-item empty recovery; page-boundary navigation/focus; reload; full-library export; no uncaught errors or horizontal document overflow. Generated 60-tile fixtures use isolated roots under this phase's ignored runs directory. No original run/baseline changes.
- **72 existing review regression assertions** pass again: keyboard controls, search/filter/index, image inspection/sizing/navigation, save failure/retry, exports, diagnostics, loading/error, empty/missing image and completion. Intercepted review writes stay in memory. Earlier evidence remains separate.
- **75 tests / 12 files**, TypeScript no-emit, lint and Bun HTML build pass on final application source. Existing capture.ts:247 non-null assertion warning remains. UI code is excluded by the existing Biome setup; real-browser execution tests its script. No new unit-test coverage claim for inline UI code.
- Eight scoped axe audits have zero violations. Mobile review reports six incomplete contrast nodes in horizontally clipped route links; the expanded viewer reports one incomplete note-helper contrast check in its scrolled container. These remain incomplete in accessibility.json. Four additional fully visible helper checks have zero violations/incomplete items and verify 12px text, 5.80:1 light and 7.31:1 dark contrast. This does not turn the earlier incomplete checks into automated passes.
- Final sequential Lighthouse audits score **100 performance / 100 accessibility / 100 best practices** on desktop and mobile. Raw results are in lighthouse-mobile.json / lighthouse-desktop.json. These local review-page audits do not certify every dialog state or production behavior.

The rendered real-content screenshots use the 24 previously captured anonymous public Create Surveys pages already isolated in field-validation. This phase does not recapture or change the target application. Synthetic fixture screenshot colors are diagnostic test input, not a design proposal for Create Surveys.

## Review and fixes

Independent standards review of c98d748 found no actionable issues. Independent specification review found two bugs: returning to the original saved note during a pending save could discard that newer edit, and filtered retry could jump to the first screenshot. Both were reproduced before repair; pre-fix-reverted-note.json and pre-fix-retry-neighbor.json retain the failure evidence. Inputs now preserve all pending edits, and decisions/retries share neighbor reconciliation. Added regressions cover both findings and multiple simultaneous failed decisions. Follow-up reviews of pinned c98d748…e9dce3e confirm both findings resolved, with no resulting actionable standards/spec issues. Reviewers read source and regression cases; they did not independently run tests or establish performance bounds.

Early harness corrections cleared an incompatible route search before asserting another comparison category and waited for native dialog close completion before checking rendered cards. The tests exposed a real focus-restoration bug, repaired using the viewed screenshot ID. No passing claim relies on those earlier failed attempts.

## Visual review

The existing design direction remains. The first mobile review with notes open left too little room for the screenshot. Moving Close beside the title, hiding unsupported blank-region controls, and keeping notes expandable restores useful image space; a browser assertion requires at least 250px of image canvas in the tested open-note layouts. Blank-region controls remain available where supported. Note help now uses readable 12px text rather than inherited 9.17px small text.

Internal rubric (1–5; fit-for-purpose assessment, not an external award claim):

| Criterion | First review | Final |
| --- | --- | --- |
| Point of view | 4 | 4 |
| Typography | 4 | 4 |
| Layout and rhythm | 4 | 4 |
| Color and imagery | 4 | 4 |
| Motion | 4 | 4 |
| Audience fit | 4 | 5 |
| Memorability | 4 | 4 |
| Craft / mobile | 3 | 4 |

Only the initial desktop feature frame is retained as round-1-viewer-1280.png; repeated harness runs overwrote the intermediate mobile feature frame. Baseline and final desktop/mobile captures are retained. Final screenshots were visually inspected; automated results alone were not used to assign craft scores.

| Template | Before desktop / mobile | Final desktop / mobile |
| --- | --- | --- |
| Review | [Desktop](before-review-1280.png) / [Mobile](before-review-390.png) | [Desktop](real-review-light-1280.png) / [Mobile](real-review-light-390.png) |
| Screenshot viewer | [Desktop](before-viewer-1280.png) / [Mobile](before-viewer-390.png) | [Desktop](real-viewer-light-1280.png) / [Mobile](real-viewer-light-390.png) |
| Dark viewer | Previous phase captures retained | [Desktop](real-viewer-dark-1280.png) / [Mobile](real-viewer-dark-390.png) |
| Failed save / retry | Existing card-only recovery | [Desktop](failed-save-light-1280.png) / [Mobile](failed-save-light-390.png) |

Other loading, load-error, empty/no-results, diagnostics, saved/completed and missing-image screenshots are in regression/. New feature fixtures and both themes are captured in after-*.png. Templates: review done; viewer done; saved/failure/retry done; filtering/no-results done; existing loading/empty/diagnostic templates regression-tested.

## Limits and next work

Actual VoiceOver remains blocked from the earlier phase; no new manual screen-reader claim. Idle resident memory remains unresolved; this feature phase does not establish new memory bounds or multi-hour stability. Physical devices, Safari/Firefox, production traffic and standalone distribution are untested. No original project data, source or baselines were modified. The existing example directory remains untouched.

Next meaningful engineering scope: investigate idle native allocation retention with a controlled profile, then standalone packaging verification if explicitly scoped. Further service/history/schema work remains approval-gated. Do not add bulk approval or automatic baseline promotion to make review faster.

Preview: http://localhost:14870/?phase=review-workflow. All tests used local synthetic or previously isolated public evidence. Stop after final report commit; no merge/deploy.

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
