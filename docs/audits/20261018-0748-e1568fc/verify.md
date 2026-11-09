# Skeptic verification, e1568fc

| id | verdict | defended severity | evidence |
|---|---|---|---|
| SEC-001 | CONFIRMED | Low (lower from Medium) | Fixture with tile file `../../../../escaped.png`: `approve` tried to read outside the run dir (ENOENT at `/private/tmp/claude-501/refute/escaped.png`). `src/cli.ts:240,249` join unchecked. run.json is written only by `spine capture`; attacker needs write access to `.design-spine/`, which already means code execution as the owner. Hygiene only. |
| DI-001 | CONFIRMED | Medium | Corrupt `lint-baseline.json`: `spine lint` printed `baseline none`, exit 0 (ratchet passes anything). `readJson` returns null on parse error (`runs.ts:19-25`). Valid baseline 0 correctly fails. Gate silently disabled, so Medium holds. |
| DI-002 | CONFIRMED | Medium (shares root cause with DI-001) | Corrupt `baselines/manifest.json` then `approve`: manifest rewritten with only the new tile, old entries lost (`cli.ts:235,260`). Recoverable from git only if baselines are tracked. Same lenient `readJson`; fix once with a strict variant. |
| ERR-001 | PARTIAL | Low (lower) | `capture.ts:506-511` does set latest and exits 0, so claim true. But `diff` marks `t.error` as `no-capture` and increments `failed` (`cli.ts:296-299`), and `evaluateGate` reports "capture failed" (`gate.ts:43`). `doctor` is preflight only and does not help. The gate catches it downstream; only the capture exit code is misleading. |
| TIME-001 | PARTIAL | Low | `new Date(clock)` at `capture.ts:303`; `validateManifest` accepts any `Date.parse`-able string (`manifest.ts:100-104`). A zone-less string is parsed in local zone, and `recipeHash` fingerprints the raw policy (`capture.ts:273-280`). Real only if the machine zone changes between baseline and capture; single operator, one machine. Not reproduced by running. |
| STR-001 | PARTIAL | Low | `biome.json` and `tsconfig.json` cover `src`, `tests` only (confirmed). 44 tracked .ts files under `design-research/` (16 top level, 28 in subdirs): evidence/audit scripts, not in `bin`, not in `build` script. Not shipped. Maintainability only. |
| TST-002 | CONFIRMED | Low-Medium; keep Medium only if CI is added | `package.json` scripts: build, spine, test, lint, format. No `tsc --noEmit`, though typescript is a devDependency and tsconfig is strict. Type errors reach `bun` unchecked. Low in practice (bun does not type-check at run). |
| CICD-001 | CONFIRMED | Medium | No `.github/` in repo; the only dotfiles are `.claude`, `.design-spine`, `.gitignore`, `.node-version`. For a regression gate tool in a public repo, no automated test run. Medium holds (one operator, so not higher). |
| CICD-002 | CONFIRMED | Low (lower) | `gh api .../branches/main/protection` returned 404 "Branch not protected". Repo is forbiddenlink/design-spine. Solo owner, no deploy; protection adds little. |
| DOC-001 | CONFIRMED | Low-Medium; Medium acceptable | `gh repo view`: PUBLIC. No README* in the working tree. Public discoverability issue, no functional impact; I would call it Low unless publication is a goal. |
| CLI-003 | CONFIRMED | Low | Symlink `rep.html` pointing at an existing file: `report --out rep.html` printed "Report saved" and overwrote the target (`cli.ts:86-88`, existsSync follows links). Needs attacker-planted symlink in cwd. |
| CLI-002 | CONFIRMED | Low | `git ls-files -s src/cli.ts` mode 100644 while `bin.spine` points at it. Only matters for npm/bin-link use; `private: true`, run via `bun src/cli.ts`. |
| ERR-002 | CONFIRMED (by reading) | Low | `critique-run.ts:29-49` awaits `proc.exited` with no timeout or kill. A hang blocks one operator-run command. Not run. |
| SEC-003 | PARTIAL (by reading) | Low | Child args (`critique-run.ts:29-44`) restrict tools to Read but do not isolate settings or hooks, so the target repo's `.claude` loads. Only matters when critiquing an untrusted repo; owner critiques own repos. Not run. |

## Duplicates and notes
- DI-001 and DI-002 share one root cause: `readJson` (`runs.ts:19-25`) collapses missing and corrupt into null. One fix (strict reader, throw on parse error when file exists) closes both.
- SEC-001 and the CLI-003 symlink are the same family (unchecked path handling) but different code paths.
- TST-002 and CICD-001 are linked: adding typecheck is only enforced if CI exists.
- Not every finding holds at stated severity: SEC-001, ERR-001, TIME-001, STR-001, CICD-002 should drop to Low. DI-001, DI-002, CICD-001 hold at Medium.
- Fixtures were under `/private/tmp/claude-501/refute/`; no project files edited.
