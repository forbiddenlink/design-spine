# Upgrade revalidation — October 9, 2026

Branch: `design/upgrade`. The requested seven phases were already implemented and committed before this turn. The phase history is 6185bca (understand), c4b5f3e (research), 823292c (decide), e8ad50d (foundation), 55bbbe2 (rollout), dd0ccdf (verify), a0e8701 (report). Later product improvements end at 66040f0. No application code changed during this revalidation. Main and production untouched; no merge, deployment, deletion, migration, paid service or baseline promotion.

## Scope and decisions

Design Spine is a local screenshot-review application with one product page at `/`. Its screenshot viewer, comparison modes, diagnostics and asynchronous states belong to that page. The demo `/`, `/cards`, `/about` pages are deliberately imperfect diagnostic inputs; restyling them would undermine their purpose. Existing example captures were not inspected or changed.

The existing direction remains appropriate: warm paper and ink, orange index marks, system typography, monospace capture metadata, indexed routes and screenshot evidence. Search, combined filters, progress, explicit decisions, reliable note saves/retries, JSON export, accessible image inspection, baseline/difference evidence, diagnostic navigation and pagination are already implemented. No additional feature was warranted by this verification.

The original twelve live reference captures and nine peer inventories remain in ../references.md and ../features.md. They were inspected as historical research; external sites were not reloaded this turn and no freshness claim is made. Original two-round screenshot/score/fix evidence remains in ../scores.md. Original before/after template coverage remains in ../report.md.

## Fresh verification

- 74 tests in 12 files pass.
- TypeScript no-emit check passes.
- Lint exits 0; existing non-null assertion warning in capture.ts remains. Inline UI is excluded by existing lint configuration.
- Bun HTML build passes. Standalone CLI packaging was not retested.
- 72 Chromium journey/state assertions pass at 1280 and 390 pixels: search, combined filters, route recovery, decisions, notes, save failure/retry, export, completion, missing screenshot, load failure/retry, empty/loading states, image navigation, actual-size toggle, dialog focus return, dark mode, no uncaught errors or document overflow.
- Browser journey writes are intercepted fixture responses, not writes to original reviews. Export artifacts are isolated here.
- Lighthouse 13.5.0: mobile and desktop each 100 performance / 100 accessibility / 100 best practices. These are local 12-capture fixture observations, not production guarantees or a manual accessibility pass.

Fresh browser screenshots include review-light/dark-{1280,390}.png and viewer, diagnostics, saved, save-error, complete, missing-image, no-results, empty, loading and load-error pairs. Review homepage captures start at the top; state screenshots show the exercised viewport. Historical comparison and persistence validation was not rerun this turn.

## Current visual assessment

Inspected fresh desktop review, mobile dark review and mobile viewer captures. Scores remain subjective local assessments: point of view 4; typography 4; layout/rhythm 4; color/imagery 4; motion 4; audience fit 4; memorability 4; craft 4. Minimal motion suits repeated evidence inspection. No new screenshot defect requiring rework was observed. These scores do not constitute an external best-in-class rating.

## Limits and stop state

Actual VoiceOver remains blocked by the previously documented native-control limitation. Physical devices, Safari/Firefox, multi-hour stress, peak-memory behavior, external critique and standalone packaging remain untested or blocked as recorded in ../accessibility-performance/report.md. Automated checks do not establish complete accessibility conformance.

No new risky change proposed. Full approval list follows. Stop after committing this checkpoint; no merge.

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
