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

## Still open

| ID | Sev | Note |
|---|---|---|
| SEC-F2b | Low | marker lookup has no author filter, so a foreign marker makes every run post a new comment. A `.user.type == "Bot"` filter breaks PAT tokens; filtering by the token's own login needs an API call that GITHUB_TOKEN may not allow. Owner call. |
| SEC-F4 | Low | Docker images pinned by tag, not digest (Dockerfile text in src/lib/docker.ts). Report only. |
| NEW-006 | Low | 404/5xx main document gives a flagged tile and exit 0. Possibly intended (404 pages are real states). Owner call. |
| DOCKER-COLON | Low | a project root containing `:` breaks `-v root:/work`. Untested. |
| REDACT-PATH | Info | tokens in a URL path segment are kept; `a,http://b` joins into one match. Accepted. |

## Held on purpose

- pixelmatch 8: needs a rebaseline release.
- playwright 1.64.x, @axe-core/playwright 4.14: Renovate (3-day minimum age) owns the bump.

## Skipped / not covered

- Live action run on a real PR (comment, summary, docker capture, artifacts). UNCONFIRMED since v0.2.0.
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
