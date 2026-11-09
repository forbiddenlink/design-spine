# Delta: design-spine audit/2026-11-09 vs 20261018-0901-5bf16d5

Snapshot as of 2026-11-09. Written against 2a8f350 (audit/2026-11-09). Mode: repair-and-verify.
Base: origin/main merged at 2689e85. Prior run: docs/audits/20261018-0901-5bf16d5/.

## Resolved (prior findings)

| ID | Evidence |
|---|---|
| RM-001 npm 404 | `npm view design-spine version` = 0.2.0 |
| RM-002 / SEC-003 unpinned action | tag v0.2.0 exists; action.yml `version` default 0.2.0 |
| SEC-001 frame headers | src/lib/server.ts:216-221 |
| SEC-002 critique child env | `--tools` allowlist and childEnv; tests/cli.test.ts "critique runs claude outside the target repo" |
| WR-001 em dashes | 0 found in docs and site |
| WR-002 unsourced comparison | PR #10 |
| FUNC-001 non-ASCII and case-colliding routes | reproduced: distinct files; `/About` + `/about` exits 2 from doctor and capture |
| FUNC-002 baselines manifest `tiles:null` | reproduced: approve and diff --strict exit 2, no PNG promoted |
| FUNC-006 truncated baseline PNG | reproduced: tile shows `unreadable`, others compare, exit 1 |

## Newly introduced since the prior run, fixed here

Severity uses the pack scale. Each fix landed with a test that fails without it.

| ID | Sev | Problem | Fix | Proof |
|---|---|---|---|---|
| NEW-BUN | Medium | darwin @oven/bun-* bumped to 1.4.4, rest at 1.3.13: macOS npm users ran an untested Bun | 7f758c0, renovate.json groups every Bun pin | tests/docker.test.ts "bundles the same bun on every platform" (red at 1.4.4) |
| SEC-F1 | Medium | console errors, page errors, broken images, tile errors and baseUrl kept query strings (tokens, signed URLs) in run.json | 9a2c763, 2a8f350 (ws/wss added after the refute pass) | tests/capture-browser.test.ts request-errors case, tests/redact.test.ts |
| NEW-001 | Medium | a state-mocked 500 was recorded as a request error, so every error-state tile stayed flagged | 6c96255 | tests/capture-browser.test.ts "does not report a state mock" (red before) |
| NEW-002 | Low | 429 then 200 on retry kept the 429 entry and flagged the tile | 6c96255 | 429 test asserts `requestErrors` empty (red before) |
| NEW-003 | Low | `tile.error` carried state query (`?token=`) | covered by 9a2c763 (`redactUrls` on tile.error) | rung 3, code walk; no browser test for this path |
| NEW-004/005 | Low | corrupt run.json said "Missing"; `tiles:null` crashed MCP with a raw TypeError | 60689d5 | tests/runs.test.ts "run recovery" (5 red before) |
| NEW-007 | Low | launcher `bun --version` had no timeout; hung over 2 min locally | 598b5c6 | tests/resolve-bun.test.ts "bounds every version probe" (red before) |
| SEC-F3 | Low | action `npm install -g` ran lifecycle scripts with the job token in scope | 9560ff6 `--ignore-scripts` | real global install with the flag, `spine --version` = 0.2.0 |
| SEC-F2 | Low | sticky comment: anyone can post the marker first; PATCH on a foreign comment failed and dropped the report | 9560ff6 falls back to POST | rung 3, code walk; not run on a real PR |
| LINT | Info | biome 2.6 useTemplate failed lint in src/ui/review.js | 996bb49, style only | review browser tests pass |

## Still open, decided

| ID | Sev | Decision |
|---|---|---|
| SEC-F2b | Low | Fixed after this report: the marker lookup now only reuses a comment written by the token's own login (`gh api user`, falling back to `github-actions[bot]` for GITHUB_TOKEN). Proven by .github/workflows/action-e2e.yml on the PR. |
| NEW-006 | Low | Keep exit 0. A 404 or 500 page can be a deliberate design state, the tile is flagged in review, and `spine diff` fails on any pixel change against its baseline. |
| SEC-F4 | Low | Do not digest-pin. The Dockerfile tag follows the installed Playwright version, so a digest table would need an update on every Playwright release; the image is built locally from two official images. Revisit if the image is ever pulled prebuilt. |
| DOCKER-COLON | Low | Leave. A `:` in a project root path is rare on macOS and Linux; switching `-v` to `--mount` trades it for a comma problem. |
| REDACT-PATH | Info | Accepted. Tokens in a URL path segment are kept, and `a,http://b` joins into one match. |

## Held on purpose

- pixelmatch 8: needs a rebaseline release.
- playwright 1.64.x, @axe-core/playwright 4.14: Renovate (3-day minimum age) owns the bump.

## Skipped / not covered

- Live action run on a real PR: covered by the action-e2e workflow on the audit PR; see the PR checks for the result.
- Bundled Bun on Linux and Windows. Only darwin-aarch64 exercised.
- Docker image build and run; macOS `--network` behavior.
- semgrep and trivy scans errored; no results.
- Review UI in a real browser beyond the vitest browser tests.

## Verification at 2a8f350

- `pnpm exec vitest run --maxWorkers=2`: 258/258 at 996bb49; redact + capture-browser 15/15 at 2a8f350.
- `pnpm exec tsc --noEmit -p .`: exit 0.
- `biome check .`: 0 errors.
- `pnpm audit --audit-level=high`: no known vulnerabilities.
- Refute pass: fresh-context Sonnet reviewer. 6 commits HOLD; redaction WEAK on ws/wss (fixed in 2a8f350); comment lookup WEAK (SEC-F2b, open).
