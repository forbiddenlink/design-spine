# structure audit (e1568fc, branch feat/spine-doctor-strict-gate-report, tree dirty: untracked only)
Rating: Acceptable. Source tree is clean; the repo root is dominated by evidence folders.

Coverage: root listing, src/, tests/, tracked-file counts, biome/tsconfig scope: inspected. knip: blocked (not installed, precheck.md). Commented-out code and TODO sweep: not covered.

## STR-001 | Medium | High | biome.json:3, tsconfig.json:12
Problem: lint and type-check cover only src and tests. 97 .ts files exist (find); biome checks 42 (src 20 + tests 19 + 3 json); tsconfig `include` is ["src","tests"]. Unchecked: design-research (44 tracked .ts, incl. verify-*.ts that back the reliability claims), functional-review (11), fixtures/demo-site/serve.ts, vitest.config.ts.
Impact: the scripts that produce the repo's evidence can rot or type-break with no signal.
Fix: add design-research, functional-review, fixtures and vitest.config.ts to biome `files.includes` and tsconfig `include` (or document them as non-code and move to a separate package).
Verification: `biome check .` file count rises to about 97; `tsc --noEmit` stays clean or reports real errors.
Note: `tsc --noEmit` on current scope is clean; `vitest` 114/114.

## STR-002 | Low | High | design-research/, functional-review/
Problem: 627 tracked evidence files (538 + 89, mostly png/json, ~57 MB tracked in design-research by du) sit beside source; names such as `*-final*`, `packaging-final-confirmed.json`, `lighthouse-*-final.json` imply superseded copies.
Impact: repo weight (.git 50M), review noise, unclear which artifact is current.
Fix: move evidence to a release asset or an `evidence/` tree with an index; keep scripts separate; delete superseded `-final` variants.
Verification: `git ls-files | wc -l` drops; links in design-research/*.md still resolve.

## STR-003 | Low | Medium | design-research/audit-lighthouse.ts, functional-review/audit-lighthouse.ts
Problem: same-named script in two folders; `diff -q` says they differ (drifted copies).
Fix: keep one, import or delete the other.

## Root
Clean for config. No README or AGENTS.md tracked (docs/USAGE.md only). `.audit-report.md` and `docs/audits/` are untracked and not ignored (left as instructed). No Old/V2 duplicates in src.
Naming: src/lib kebab-case files; tests mirror names. Consistent.
