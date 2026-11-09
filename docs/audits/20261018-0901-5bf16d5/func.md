# func: functional flows (CLI public entry points)

Repo /Volumes/LizsDisk/design-spine, branch main, commit 5bf16d5, tree has untracked docs/audits, design-research, examples/testimoniq/.design-spine only. Bun CLI `spine`, no auth, no payments. Mode: audit-only. Env: local fixtures under /private/tmp/claude-501/qa/ (SPINE_CWD), local http.server fixture for one real capture. Docs/audits/ left untracked, .gitignore untouched.

## Findings

FUNC-001 | Medium | High | src/lib/names.ts:3-12, src/lib/capture.ts:73-87
Problem: tile filenames are lossy. `clean()` strips every non-ASCII letter, so every route made only of non-Latin characters slugs to `home`; case-only route pairs produce names that collide on case-insensitive APFS.
Evidence: app/ with `关于`, `контакты`, `/` -> `spine doctor` exit 2: "Multiple route/state combinations produce the same capture filename: home__ideal__390__light.png. Routes / and /контакты share the slug home". `spine doctor --manifest case.json` with routes /About and /about exits 0 (4 capturable) although both write About__/about__ files on the same APFS volume (case collision not reproduced end to end).
Impact: sites with non-Latin route segments cannot be captured in one run, and separate `--routes` runs overwrite the same baseline file.
Fix: encode non-ASCII (percent or hash suffix) in routeSlug, and detect collisions on lowercased filenames.
Verification: doctor on the r4 fixture exits 0 and lists distinct filenames.

FUNC-002 | Low | High | src/cli.ts:294-296,318-335; src/lib/runs.ts:31-38; src/cli.ts:396,413
Problem: `readStateJson` only checks JSON syntax. A baselines/manifest.json that parses but has the wrong shape (`{"tiles":null}`, `[]`) passes it, then `approve` throws a raw TypeError after already promoting the first PNG.
Evidence: manifest `{"tiles":null}`, `spine approve` -> "spine: null is not an object (evaluating 'manifest.tiles[t.id] = {...". exit 2. home__ideal__390__light.png was replaced with the new bytes while manifest.json and the other tiles stayed old. `diff --strict` with the same file: "null is not an object (evaluating 'baselineManifest?.tiles[t.id]')".
Impact: fails closed (strict diff later reports modified-baseline) but leaves a half-promoted baseline set and an unreadable message. Today's corrupt-manifest fix covers syntax only.
Fix: validate `tiles` is a plain object in a shared loader, and build the new manifest in memory before writing any PNG.

FUNC-003 | Low | High | src/lib/server.ts:49-66,67-72 vs 175-180
Problem: GET /api/run (and loadRun/loadReview callers on GET paths) has no try/catch; POST /api/review returns a JSON 503 for the same corrupt review.json.
Evidence: review.json `{"tiles":{"a":null}}` -> GET /api/run and /api/run?compare=false return 500 with a 67 KB Bun error HTML page; server log shows the real message. No filesystem paths found in the body.
Impact: UI shows a failure with no actionable text.
Fix: catch and return 422 JSON with the message, as /api/report and POST do.

FUNC-004 | Low | High | src/lib/routes.ts:51-88 vs src/lib/manifest.ts:116
Problem: `plan` emits routes the validator rejects.
Evidence: dirs `a#b`, `q?x`, `back\slash` -> `spine plan` exit 0 and writes them; `spine doctor` exit 2 "manifest routes[4].path: expected a local route path without query or hash".
Fix: skip or warn on such segments in `plan`.

FUNC-005 | Low | Medium | src/cli.ts:266-277; src/lib/critique-run.ts:88-98
Problem: `critique` exits 0 when every tile ends as verdict "error".
Evidence: fake claude that hangs, `--timeout 2` -> "[1/1] ...: error", "Wrote critique.json", exit 0.
Fix: exit 1 when any tile errored.

FUNC-006 | Low | High | src/cli.ts:406-408
Problem: non-strict `diff` aborts the whole run on one undecodable baseline PNG with a pngjs message and no tile id.
Evidence: baseline truncated to 40 bytes -> "spine: There are some read requests waitng on finished stream", exit 2.
Fix: catch per tile, report `id: unreadable-baseline`, count as failed.

FUNC-007 | Low | High | src/cli.ts (status action), src/lib/lint.ts:66, src/lib/routes.ts:78
Problem: (a) `status` swallows corrupt state: bad lint-baseline.json and a run.json with an invalid tile.file both print exit 0 with lintBaseline null / lastRun null while `lint` and `diff` exit 2. (b) `lint` calls statSync with no guard: one dangling symlink under src/ aborts it ("ENOENT ... stat '.../src/dangling'", exit 2); `scanRoutes` has safeStat for the same case. (c) both walkers follow directory symlinks with no cycle guard (a self-symlink in app/ produced 396 bogus routes before ELOOP).
Fix: reuse safeStat, skip symlinked dirs (lstat), and surface corruption in `status`.

## Re-verified fixes (hold)
- corrupt lint-baseline.json, baselines/manifest.json: exit 2 (syntax errors). Shape errors: see FUNC-002.
- run.json tile.file: `../../secret.png` rejected by loadRun; /api/run?run= returns 404, /api/runs lists it with 1 tile only.
- capture.clock: no offset exits 2; `Z` and `+0100` pass.
- critique: argv shows `--setting-sources user --strict-mcp-config`, cwd under tmpdir (spine-critique-*), stdin carries route only, no query; --timeout 2 killed a bash+sleep process group (0 survivors); models `sonnet; rm` rejected.
- report refuses an existing output (exit 2), --force overwrites; usage errors, bad numbers exit 2; approve --dry-run lists add/replace and writes nothing; approve records imageHash; diff --strict reports modified-baseline for a 1-byte-appended baseline.

## Coverage
| area | status |
| plan, doctor, capture (real Chromium, 6 tiles, stability, a11y, masks) | verified |
| review server routes, Host/Origin, /img, run select | verified (see sec.md) |
| approve, diff, diff --strict, lint, status, report, critique (fake bin) | verified |
| vitest suite on a copy | verified: 20 files, 162 tests pass |
| bun build --compile, comparison worker in the compiled binary, GitHub Action | not covered (writes dist/, needs CI) |
| UI behavior in a browser | not covered (UI file read for XSS sinks only) |
