# Design Spine improvement implementation plan

**Goal:** implement the recommended local-tool improvements from research-2026-10-10.md, preserving existing evidence and explicit human approval.
**Architecture:** additive optional fields on existing manifests/runs; shared capture planning and gate policy; existing Bun/Playwright/UI stack. Old runs remain readable and display unknown coverage/provenance. No hosted services or framework rewrite.
**Execution:** native implementation in this session, authorized by “lets do all we should”; test-first behavior changes, focused browser checks, then independent code review. No extra approval pause for routine work.

## Constraints and review focus

- Do not inspect example/private captures or secrets; use generated fixtures.
- Preserve existing capture filenames and baselines. No automatic approval or baseline migration.
- `setup` stays prose; recipes use validated structured operations, never eval.
- Validate untrusted config and paths before capture; never export session storage or raw credential-bearing network traces.
- New strict policy is opt-in; pixel-only diff remains compatible. Strict policy rejects unknown coverage, missing evidence, unreviewed/rejected evidence and incompatible provenance.
- New metadata is versioned. Old files retain their original bytes.
- Verify delayed readiness, skipped states, filter scope, hostile inputs, note recovery, image identity and offline exports.

## Stages

- [x] 1. Foundation: manifest validation/doctor, coverage planning/persistence, provenance, strict gate. Test malformed manifests, TODO params, excluded/todo/failed states, old runs and exit matrix.
- [x] 2. Capture: bounded readiness, structured interactions and network fixtures, repeat stability, explicit motion/time policy, visible masks and bounded diagnostics. Test synthetic delayed readiness, stable/unstable pages, readiness errors and malformed session context.
- [x] 3. Inspection: regional differences/jumps, synchronized comparison and overlay, coverage/provenance display, deterministic queues/route progress and deep links. Preserve focus, drafts and decision semantics.
- [x] 4. Review records: anchored notes tied to image hashes, local run history with unsaved-change protection, portable offline reports. Test containment, stale anchors and report escaping.
- [x] 5. Onboarding and checks: first-run guidance, optional accessibility checks, explainable token exceptions, compiled distribution smoke test and short memory measurement. Document honest support limits.
- [x] 6. Design handoff: retain current identity; implement only mechanical layout tightening supported by measurable acceptance. Claude/Antigravity prototypes remain external work because no tool is connected and user instructions route taste work to Claude. Conditional P2 adapters/browser/reference features remain conditional; do not fabricate a use case.
- [x] 7. Review and final verification: unit/integration tests, typecheck, lint, build, isolated browser workflows and bounded performance measurement. Record completed work and concrete remaining limits.

Each stage adds a failing public-behavior test, observes failure, implements the minimum coherent behavior, and runs the relevant regression checks. Update this checklist with evidence as work progresses. Do not claim all research suggestions are implemented merely because one stage passes.

## Delivered scope and evidence

- Foundation: `doctor`, strict manifest validation, version-2 matrix coverage, explicit exclusions, environment provenance and normalized per-tile recipe hashes. `diff --strict` verifies original image hashes, human decisions, comparison results, recipe/environment compatibility and whole-manifest coverage. Partial `--routes` selections cannot pass strict mode. Default pixel-only behavior remains compatible.
- Capture: bounded visible-selector readiness; structured click/hover/fill/press/wait operations; response fixtures; fixed Date and animation policy; bounded repeated screenshots; optional axe scans; explicit comparison masks with reasons and untouched originals. Context-init failures now preserve failed coverage. Console/page error accumulation is bounded. Rich network traces are deliberately not collected; diagnostics retain failure stage, bounded messages, existing page flags and warnings without session dumps.
- Inspection: regional change counts/locations, long-page jumps, split comparison with shared scroll, adjustable opacity overlay, coverage/environment/recipe status, route review counts, existing combinable queue filters and run/tile URLs. Mechanical compacting brings a screenshot preview above y=560 in a 1260×700 synthetic desktop view; it preserves the existing visual identity.
- Review records: one native-coordinate location per note, hash validation against actual PNG bytes, visible marker, keyboard coordinate entry and jump/clear actions; safe sibling history; unsaved/failed-save protection; failed-switch recovery that cannot mix runs; offline static HTML with embedded original screenshots and escaped saved notes, diagnostics, mask reasons, coverage and provenance.
- First-run and tooling: expanded existing `docs/USAGE.md`, Node/pnpm pins, optional automated accessibility scans, single-line explained token exceptions, build and standalone smoke checks. No framework replacement or hosted service was added.
- Design: current identity retained. The updated external exploration prompt reflects the implemented backend instead of describing existing capabilities as missing. No Magica or Antigravity tool is connected; no API key or secret was opened. The supplied Claude/Antigravity prompt is the authorized fallback for visual taste work.

## Review and checks

Final verification on October 10, 2026: all 18 test files and 113 tests passed; TypeScript checking, Biome lint and the compiled build passed. The compiled executable then passed the browser review workflow and CLI suite (2 files, 23 tests). These checks used synthetic fixtures; no private captures or real baselines were required.

Four read-only reviewers covered intent/regressions, security/privacy, reliability and contracts. Confirmed findings were fixed and rechecked: failed history-switch state mixing, untrusted Host handling, recipe compatibility, route-filter coverage bypass, per-tile context-init failure, enum coercion, omitted report diagnostics/HTTP errors and partial baseline promotion on failed preflight. Promotion now validates all selected images before writing any baseline.

Verification artifacts live in `implementation-verification/`. The browser workflow uses generated data only and covers saving, hash-bound note markers, overlays, change jumps, historical runs, a failed switch and retry, stale-anchor rejection, hostile Host/Origin rejection, offline reports, no horizontal overflow and tagged axe scans at 1260, 630 (a narrow-layout proxy for 200% zoom), and 390 pixels in both themes with reduced motion. This is not a substitute for browser zoom, screen-reader or human testing.

The short memory probe ran two 12-tile comparisons at 1280×4000: 4,423 ms total, 88 MiB initial RSS, 373 MiB peak and 373 MiB after 17 seconds idle. The process did not return to its initial RSS. Reference-release tests pass, but this measurement neither proves a leak nor establishes a hard memory bound. Do not claim multi-hour soak readiness from it.

## Explicit remaining limits

- Human evaluation of the two visual directions, VoiceOver, physical devices and real browser zoom remain external validation work. A generated prototype is not evidence that users perform tasks better.
- A multi-hour comparison/idle memory soak remains necessary before claiming bounded long-session memory. Current retained RSS is recorded above.
- Conditional P2 image/Storybook adapters, additional browser/locale/RTL profiles and design-reference imports remain conditional until an actual use case establishes their requirements.
- Original baselines and pre-existing example evidence were neither promoted, migrated nor inspected. No deployment, commit or external publication was performed.

## Follow-up verification — October 10, 2026

The first-run browser test now exercises a new temporary project through `plan`, unfinished `doctor`, a configured interaction/readiness recipe, capture in both themes, browser review, explicit CLI promotion, strict gating and a report opened from disk while HTTP requests are blocked. It verifies that review decisions alone cannot create baselines or pass a missing-baseline strict check. This passed against source and the compiled executable, running outside the checkout.

The review browser test additionally checks initial dialog focus, 35 Tab steps without focusing background page controls, Escape returning focus to the same Inspect button, Enter reopening the viewer, keyboard opacity adjustment, and tagged axe scans inside the dialog at desktop and mobile widths. Native Chromium may move focus to browser chrome during a Tab cycle; this is distinguished from background page focus. These checks passed for the compiled executable as well. They do not replace VoiceOver or actual browser zoom testing.

`implementation-verification/memory-soak.ts` is a reproducible, self-contained synthetic HTTP probe; it reads no existing captures. The completed run requested 600 seconds and took 648.9 seconds because the last comparison and final idle check finish before exit. It verified 26 complete 24-tile comparisons (624 tile comparisons and 1,248 baseline/difference image hash checks), 639 note-save/readback cycles and eviction beyond the four-snapshot cache, with no integrity failures. Each image comparison includes an explicit mask and a separate unmasked lower-page change.

| Measurement | Observed result |
| --- | --- |
| Sampled process RSS peak | 1,506 MiB |
| Six 17-second worker-idle checkpoints | 55, 54, 54, 55, 289, 48 MiB |
| Final natural idle RSS / after diagnostic forced collection | 377 / 373 MiB |
| Note-save roundtrip median / sampled p95 / maximum | 5.5 / 268.7 / 2,610.9 ms |
| Comparison durations, including fetching and hashing all evidence | 4.2–97.3 seconds |

These are local observations, not production percentiles or a memory bound. Reference construction occurred in the same process before measurement; its initial sample still reported 1,360 MiB RSS and 376 MiB external memory despite a forced collection. Peak memory therefore includes the reference pass's allocation history and must not be presented as an isolated server allocation peak. Browser and regression checks overlapped this run; later system load averages reached about 190, and a version-only executable invocation took 6.9 seconds with 0.39 seconds of CPU work. Timing data is materially confounded by host contention. The final retained RSS also remains higher than several intermediate idle checkpoints. No product memory or speed fix is justified by this probe alone; multi-hour and high-entropy image validation remain outstanding.

The raw result is `implementation-verification/memory-soak.json`. The script defaults to 7,200 seconds for a future two-hour run and has a 2.5 GiB sampled RSS safety ceiling. Its main-thread heap counters exclude worker heaps. Current [Bun worker documentation](https://bun.com/docs/runtime/workers) provides lifecycle context; measurements here are from the pinned Bun 1.3.13, not a claim about every runtime version.

Regression follow-up reproduced an expensive test assertion: generic deep equality of an 800,000-byte buffer took 17.2 seconds on this host. Replacing it with native `Buffer.equals` preserves exact byte-identity verification; the complete four-test diff file then passed in 516 ms. No product comparison behavior or test timeout was changed for that fix. Under host contention, CLI tests also exceeded the runner's default five-second test deadline despite preserving their individual subprocess bounds; record runner options with the final verification result.

Final follow-up verification: 19 files / 114 tests passed in 72.85 seconds with `SPINE_CLI_BIN=design-research/build/spine SPINE_REVIEW_BIN=design-research/build/spine pnpm exec vitest run --maxWorkers=2 --testTimeout=60000`. This uses the compiled executable for subprocess CLI/review tests; library tests still exercise source. The longer runner allowance addresses the measured host contention; individual CLI subprocess timeouts and behavior assertions were not relaxed. TypeScript, Biome (42 files) and whitespace checks passed. The soak harness also passed a separate strict TypeScript check. No production source changes, baseline promotions outside synthetic fixtures, commits or deployments were made during this follow-up.
