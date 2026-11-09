# Action plan: design-spine audit 20261018-0748-e1568fc

Mode: audit-only. Commit e1568fc (branch feat/spine-doctor-strict-gate-report). 25 modules run, 49 raw findings, refuted and deduped in verify.md. Severities below are the defended ones after the refute pass.

## Do first (Medium)

1. **Strict state-file reads (DI-001 + DI-002, one root cause).** `readJson` (src/lib/runs.ts:19-25) treats a corrupt file the same as a missing one. Result: `spine lint` passes with a corrupt lint-baseline.json, and `approve` rewrites a corrupt baselines/manifest.json, dropping every other tile's entry. Fix: one strict reader that returns null only on ENOENT and exits 2 on parse failure or a missing `count`. Add tests for both. About 30 minutes.
2. **CI workflow (CICD-001, with TST-002 and STR-001).** There is no .github/. Add a PR workflow: frozen-lockfile install, `biome check`, `tsc --noEmit` (add a `typecheck` script), `vitest run`, playwright chromium install. Pin actions by SHA and set least-privilege permissions. Optionally widen biome and tsconfig includes to fixtures/ and vitest.config.ts. About 1 hour.

## Next (Low, cheap)

3. Containment for `tile.file` in approve, diff and critique (SEC-001). Reuse `containedPng()` from comparison.ts and validate filenames in loadRun.
4. `capture` exits non-zero when any tile errors, and does not move `latest` on a failed run (ERR-001). The gate already catches it downstream, so this is about clearer signals.
5. Require Z or an offset on `capture.clock` (TIME-001).
6. Timeout plus kill on the spawned `claude` in critique (ERR-002). Optionally isolate its settings (SEC-003).
7. `report --out`: write with flag `wx` or tmp+rename (CLI-003). `chmod +x src/cli.ts` in git (CLI-002). Map commander usage errors to exit 2 (CLI-001).
8. .gitignore: `.env*`, `storageState*.json`, `.audit-report.md` (SECRET-001, REPO-003).
9. README linking docs/USAGE.md; decide on a LICENSE (DOC-001, DOC-003). Remove deprecated @types/pixelmatch (DEP-001).

## Later / owner decision

- Branch protection on main once CI exists (CICD-002).
- Move design-research/ and functional-review/ evidence out of the source tree (REPO-001, STR-002). Scraped third-party pages in a public repo are a republishing question for the owner.
- pixelmatch 8 and playwright 1.64 bumps (DEP-002); diff writes PNGs for unchanged tiles (PERF-001); baseline image hashes and atomic copies (DI-003); approve --dry-run (RB-001); review.json persistence (BK-001).

## Not covered

Review UI in a real browser; a real `claude` vision call; knip (not installed); browser crash and SIGKILL during capture; viability verdict (project goal UNKNOWN); competitor pricing (no network fetch).
