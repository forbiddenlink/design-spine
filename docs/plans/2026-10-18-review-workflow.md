# Review workflow implementation plan

Goal: implement the six improvements approved in the project review, preserving the existing visual style and local-only evidence model.

## Scope and constraints

- Add `diff --require-baselines` and an opt-in GitHub Action input. Preserve default and strict behavior.
- Extract the review CSS and JavaScript into checked source files without adding a UI framework. Source and compiled CLI must serve the same assets.
- Make secondary filters collapsible on mobile, keep screenshots visible sooner, and reduce success-notification obstruction.
- Add an accessible coverage matrix: route/state rows, width/theme columns, text labels, clickable captured evidence, and explicit unavailable outcomes. No automatic approvals.
- Add deterministic visual regression checks and a 60+ capture browser fixture covering pagination, mixed decisions, missing evidence, and long routes.
- Add a small self-contained interactive website demo and correct the installation instructions.
- No unrelated changes, confidential examples, deployment, or publishing. Use Node 22.23.1 and Bun 1.3.13.

## Tasks

1. Baseline policy: add failing CLI tests for missing/unchanged/changed evidence, implement flag and Action wiring, document behavior in USAGE.
2. Review assets: extract CSS/JS, serve fixed asset routes in source and compiled builds, enable lint checks, retain all existing browser tests.
3. Mobile and coverage: add failing browser assertions, implement using existing tokens, verify keyboard navigation, missing states and narrow layouts.
4. QA: exercise 60+ tiles and pagination; compare checked-in synthetic screenshots in a pinned browser environment; fail on missing visual baselines rather than silently generating them.
5. Website: add a local interactive before/after example with rejection/note feedback and reset; verify keyboard, responsive layout and no external writes; update setup.
6. Run lint, type checks, full tests, compiled-CLI checks, and a fresh code review. Address material findings and commit only this task's files.

## Review focus

- Captured cells hidden by active filters or pagination still open their exact evidence.
- Missing, failed, excluded and legacy coverage never look approved.
- Collapsed controls stay keyboard-accessible and react correctly across breakpoints.
- Compiled CLI includes extracted UI assets; npm package includes them through src/.
- Visual tests use synthetic data and explicit baseline updates; Linux CI must not compare against macOS rendering.

## Progress

- Baseline: 218 tests, lint and type checking passed during the preceding review.
- Work stays in the current checkout on a feature branch, preserving pre-existing untracked work and avoiding an unnecessary repo copy.
- Implemented all six tasks: baseline policy, checked UI assets, mobile controls, coverage matrix, visual regression checks, and interactive website example.
- Final source verification: 224 tests across 27 files pass; lint, type checks and compiled build pass.
- All 16 pinned Linux visual comparisons pass against inspected baselines, covering light/dark review layouts, coverage, inspection and the website demo.
- Compiled executable verification: all three existing/new browser workflows pass against `dist/spine`.
- Fresh independent review identified an approved screenshot whose file was deleted still appearing approved in the matrix. A regression test reproduced it; the matrix now reports Missing capture and disables that cell after comparison loads.
