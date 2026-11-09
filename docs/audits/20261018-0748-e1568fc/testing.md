# testing audit (e1568fc)
Run: `vitest run` 19 files, 114 passed, 6.9 s wall (my run). Runner vitest 5.0.3 (vitest.config.ts:3, include tests/**). Test command is `pnpm test` (package.json:11). No `.skip/.only/.todo` in tests (grep). No coverage tool configured (recorded, not a finding). Playwright is used inside tests (capture-browser, onboarding-browser, review-browser) rather than a separate E2E config. No auth/payment/DB: those checks N/A.

## TST-001 | Low | Medium | src/lib/critique-run.ts, src/lib/comparison-worker.ts
Problem (hypothesis, label): grep finds no direct test import of critique-run (spawns the `claude` binary, cli.ts:187) and comparison-worker; only review-browser.test.ts references lib/server or critique-run, so error paths (missing binary, worker crash) may be untested.
Fix: add tests with a fake SPINE_CLAUDE_BIN.
Verification: new test fails when the binary path is invalid.

## TST-002 | Medium | High | package.json:6-12
Problem: no `typecheck` script; `tsc --noEmit` (clean now) is never run by `pnpm test` or `pnpm lint`, and covers only src+tests (STR-001).
Fix: add "typecheck": "tsc --noEmit" and run it with tests (owned by CICD-001 for gating).

Not covered: test quality review (mocking depth, flake rate over repeats), snapshot rot (no snapshots found by name only).
