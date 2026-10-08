# Upgrade progress

Branch: `design/upgrade`. Main and production untouched. User confirmed this scope is Design Spine itself, including continued product improvement.

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
