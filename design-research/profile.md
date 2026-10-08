# Design Spine profile

Design Spine is Liz-owned developer tooling that captures web pages and gates visual changes through local review, optional Claude critique, image baselines, and a Tailwind-value ratchet.

Audience: developers and designers reviewing their own permitted repositories. Main action: inspect capture evidence, approve or reject individual screenshots, and leave useful notes before explicitly promoting approved captures through the CLI.

## Repository and routes

- `src/cli.ts`: plan, capture, critique, review, approve, diff, lint, status. Bun runtime; TypeScript, Playwright, PNG processing. No Node runtime pin exists. Observed Node 22.23.1 and Bun 1.3.13.
- `src/lib/server.ts`: GET `/` renders the sole product template; GET `/api/run` supplies captures, review, and critique; GET `/img/*` serves run screenshots; POST `/api/review` persists a decision or note. No CMS, database, authentication, marketing site, or subscription service.
- `src/ui/index.html`: inline styles and JavaScript. Shared UI: sticky header, counters, two filters, grouped route/state sections, screenshot cards, badges, critiques, decision buttons, notes, full-size image overlay.
- `src/lib/capture.ts`: browser capture and automatic diagnostics. `runs.ts`: disk state; `review.ts`: merge partial review patches; `diff.ts`: baseline pixel comparison; `critique*.ts`: optional external critique; `routes.ts`: Next.js route discovery; `lint.ts`: design-token ratchet.
- `fixtures/demo-site/public/{index,cards,about}.html`: deliberately imperfect test pages at `/`, `/cards`, `/about`. These are capture fixtures, not business pages. Preserve their content and visual defects so diagnostics remain meaningful.
- `examples/testimoniq/design-spine.json`: example manifest, not Testimoniq application source. Existing untracked captures in that example are outside this upgrade and were not opened.

## Existing design

System UI sans with monospace route labels; 14px body, 15–16px headings, 11–12px metadata. Light palette: warm gray #f6f6f4, white surfaces, #1b1b1a ink, blue #2f5fd0 accent. Dark palette follows OS preference. Green approval, red rejection, amber warning. Border-based cards with 6–10px radii; spacing mostly 4/6/8/10/12/14/24/28px. Four columns above 1100px, two down to 560px, one on smaller screens. No external fonts or imagery; capture screenshots are the content.

## Content and journeys

Manifest → route/state/viewport/theme tiles → browser diagnostics → optional critique → review decisions and notes → CLI baseline promotion → diff gate. Review supports j/k movement, a/r decisions, Enter zoom, Escape close. Decisions toggle back to undecided. Notes save on change. Filters combine flagged and unreviewed.

Weaknesses confirmed in code: unhandled initial-load failure; silent failed writes; unlabeled note fields; image zoom reachable only by mouse or selected-card Enter; overlay has no focus management; no route search or route navigation; no progress representation or export. Screenshots below document the loaded interface, rather than assuming its rendered appearance from source.

## Baseline evidence

Real Playwright captures, 1280px desktop and 390px mobile, from the public fixture run served on localhost:14747:

- `screenshots/before/review-{1280,390}.png`: sole review template.
- `screenshots/before/viewer-{1280,390}.png`: screenshot overlay.
- `screenshots/before/empty-{1280,390}.png`: empty run (browser intercept).
- Fixture pages: `design-research/.design-spine/runs/2026-10-08T15-32-24-858Z/` contains 12 actual captures across three routes, two widths, two themes.

## Unknowns

No business claims, adoption counts, release roadmap, hosted collaboration requirements, or preferred brand font are documented. Treat this as a local developer application. No claim that the marketing pages of paid competitors expose their authenticated application UI. Existing test configuration excludes UI files from Biome; browser checks must cover that interface directly.
