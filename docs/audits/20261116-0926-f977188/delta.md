# Delta: design-spine 2a8f350..f977188

Snapshot as of 2026-11-16. Written against f977188 (fix/pr-d, working tree clean apart from this untracked run folder). Mode: AUDIT-ONLY. docs/audits/ is left untracked; .gitignore not edited.
Prior run: docs/audits/20261109-0955-2a8f350/ (delta.md, gate.md). Refuted history read: docs/audits/20261018-0748-e1568fc/verify.md (nothing in it re-raised).
Scope: 168 files, 21 commits by the owner plus 1 dependabot. Stack: Bun/TypeScript CLI, pnpm, vitest 5.0.5, playwright 1.63.0 (package.json).
Rung key: 2 = cited, 3 = walked the path, 4 = ran code.

## Resolved (prior findings still holding)
- [Info] Prior SEC-F2b (sticky comment author): action.yml:141-151 now filters by SPINE_AUTHOR. Not re-run on a real PR this time.
- [Info] Prior NEW-006 / DOCKER-COLON: DOCKER-COLON now fixed by bindMount (src/lib/docker.ts:39-45, commit 856b021). Rung 3.
- Prior FUNC-002 (`tiles:null` manifest): src/lib/runs.ts:68-70 still rejects it. Prior FUNC-006 (truncated PNG): src/lib/diff-run.ts:121-125 still reports `unreadable` and continues. Rung 3.

## Still-Open
None carried over unchanged (SEC-F4 digest pinning and REDACT-PATH remain accepted decisions; not re-examined).

## Regressed (0)
None found.

## Newly-Introduced (7)

| ID | Sev | Conf | Rung | Status |
|---|---|---|---|---|
| DLT-001 | Medium | High | 4 | open |
| DLT-002 | Low | Medium | 3 | open |
| DLT-003 | Low | Medium | 3 | open |
| DLT-004 | Low | High | 3 | open |
| DLT-005 | Low | High | 3 | open |
| DLT-006 | Low | Medium | 3 | open |
| DLT-007 | Low | Medium | 3 | open |

### DLT-001 | Medium | Confidence High | rung 4 | open
- Location: src/lib/aria.ts:53 (`if (!existsSync(before) || !existsSync(after)) return []`), used at src/lib/diff-run.ts:66-74 and :102.
- Problem: the structure check fails open when the baseline `.aria.yml` is missing, although the baseline manifest records `ariaHash` for it (src/lib/baselines.ts:80) and nothing verifies it.
- Impact: delete (or never promote) a baseline snapshot and a pixel-identical tile with a changed accessible structure (lost button label, changed heading level) reports `ok`, exit 0. Under `--strict` the new carried approval (gate.ts:68-72) then lets it through with no human decision. `modified-baseline` (diff-run.ts:95) hashes only the PNG.
- Exploitability: any PR author who can edit the committed baselines directory. Also happens innocently: a baseline approved before `capture.ariaSnapshots` was on, in non-strict runs (strict trips on recipe/policy mismatch instead).
- Reproduction (rung 4): bun script in the scratchpad built a run with `ariaHash`, a baseline PNG identical to the capture, a manifest entry with `ariaHash`, no baseline `.aria.yml`, and a capture snapshot that lost its label. `diffRun` returned `[{"id":"a","result":"ok","ratio":"0.00000"}]`, failedComparisons 0. Script: scratchpad/probe.ts (not in the repo).
- Fix: when the capture has `ariaHash` and the manifest entry has `ariaHash` but the baseline file is missing or its sha256 differs, return a failing row (`modified-baseline` in strict, `structure-missing` otherwise).
- Verification: add a case beside tests/diff-run.test.ts "orphan baselines" that deletes the baseline snapshot and expects failure.

### DLT-002 | Low | Confidence Medium | rung 3 | open
- Location: src/lib/docker.ts:201 (reaper), :234-247 (`docker ps -a --filter label=design-spine.pid`), :250-258 (`processAlive`).
- Problem: liveness of a container's owner is tested with `process.kill(pid, 0)` in the caller's PID namespace, but the label is global to the Docker daemon.
- Impact: with a shared daemon and separate PID namespaces (self-hosted runners with container jobs and a mounted docker.sock, or a remote DOCKER_HOST), job B sees job A's pid as dead and runs `docker rm -f` on A's live capture, failing A's job. Fails closed (spurious red), never a false pass. The reverse case (pid reuse) only leaks a container.
- Fix: also require the container to be older than the capture timeout, or include hostname in the label and skip containers from other hosts.
- Verification: staleContainers unit test with a foreign-host label.

### DLT-003 | Low | Confidence Medium | rung 3 | open
- Location: src/lib/capture.ts:464-467 (watchdog) and :732 (`await ctx?.close()` in finally).
- Problem: the watchdog closes `ctx`, which is undefined while `browser.newContext` (469) is pending, and the closing await in the finally block has no bound.
- Impact: a wedged browser at context creation, or a context whose close never settles, still hangs the run with no run.json, the failure the watchdog was added to stop (commit 7d2fe87). The script-loop case is covered and passes (rung 4: `vitest run tests/capture-browser.test.ts -t "script loop"`, 1 passed, 7 s).
- Fix: race the final close against a short timer; on newContext timeout, close the browser.
- Verification: unproven for these two paths; hypothesis.

### DLT-004 | Low | Confidence High | rung 3 | open
- Location: src/lib/capture.ts:435 (`policy: manifest.capture ?? {}` in recipeHash) and :132 (provenance policy), field added at src/lib/manifest.ts:95-99.
- Problem: `capture.tileTimeoutMs`, a run-time safety limit that does not affect pixels, is part of the recipe fingerprint and provenance policy.
- Impact: raising the timeout on a slow CI runner changes every tile's recipeHash, so `--strict` reports "capture recipe unknown or differs from baseline" and "baseline provenance incompatible" for every approved tile until all baselines are re-approved. Same shape as pre-existing `timeoutMs`.
- Fix: exclude non-rendering operational keys from both fingerprints.

### DLT-005 | Low | Confidence High | rung 3 | open
- Location: src/commands/diff.ts:89-92, src/lib/summary.ts (no orphan input), action.yml:6-41.
- Problem: orphaned baselines are only a console warning outside `--strict`, and never reach the PR summary or comment; the action exposes no `max-region` input, so the new cap is CLI-only.
- Impact: in the default action config (non-strict) a removed or renamed route passes silently from the reviewer's point of view, and the stale baseline stays. Strict then fails with "remove it from the baselines" (diff-run.ts:162) but no command exists for that (src/commands has no baselines-removal command; `prune` states baselines are untouched, prune.ts:27).
- Fix: pass `orphans` to buildSummary; add `max-region` to action.yml and a `spine approve --remove-orphans` or equivalent.

### DLT-006 | Low | Confidence Medium | rung 3 | open
- Location: src/lib/gate.ts:68-72, action.yml:14-17.
- Problem: strict "approval" is now satisfied by a committed baseline with the same hash; `sameFindings` compares only the rendered finding strings, which carry counts (src/lib/runs.ts:196-198: "1 console error").
- Impact: (a) a PR that updates baseline PNG and manifest approves itself under `--strict` with no review.json, which changes what the action's `strict` input description ("require ... approval") means; (b) swapping one console error for a different one keeps the same string and carries. Pixel-identical only, so reach is limited.
- Fix: say so in the input description; include a hash of the finding text in `findings`.

### DLT-007 | Low | Confidence Medium | rung 3 | open
- Location: src/ui/review.js:1011, :966-969, :1052-1056, :1049.
- Problem: `state.saveError` is global. Any later successful save sets it to null (1011), and `setSaveStatus` rebuilds the status box without the Reload button (969), so a 409 explanation and its Reload button vanish while the failed tile is still unsaved. Reload (`location.reload()`) also discards in-memory drafts that the adjacent message says remain.
- Impact: reviewer loses the stale-evidence reason, then loses unsaved notes. Server side is sound: server.ts:142-157 and :158-185 return 409, :199-212 enforce the note-before-approve rule.
- Fix: key saveError by tile id; render Reload inside setSaveStatus; warn before reload when drafts exist.

## Checked, no finding
- src/lib/diff.ts `largestChangedRegion` (129-145) and src/lib/diff-run.ts:128-134: cap applies only when the page ratio passes, sizeMismatch has no `diff`, null-safe; `--max-region` validated by numberOption (shared.ts:8-28) as an integer 1..MAX_SAFE_INTEGER. `vitest run tests/diff-run.test.ts tests/gate.test.ts`: 26 passed (rung 4).
- Orphan logic (diff-run.ts:152-156): coverage ids include filtered, excluded and skipped screens (capture.ts:55-87), so `--routes` runs do not create false orphans.
- Review server write path: loopback host check (server.ts:20), Origin check (:119-122), atomic write (runs.ts:74-79), no await between read and write of review.json (:186-213).
- Promotion (baselines.ts:19-40, 49-90): hash re-check before copy, tmp+rename, aria removed when absent.
- Dependency delta: playwright `^1.63.0` to `1.63.0`, @types/bun 1.4.4 to 1.3.13 (matches bundled Bun), version 0.2.1. `pnpm audit --audit-level=high`: no known vulnerabilities. `npm view design-spine version` = 0.2.1, tag v0.2.1 exists.
- Hallucinated imports: every bare import in src, tests, scripts is in package.json except `lost-pixel`, which is a string inside a fixture (tests/cli.test.ts:891). Not a dependency.

## Agent-code-trust (same diff)
- Hallucination findings: none found. Plausible-but-wrong logic found: DLT-001 (fail-open on missing file), DLT-006.
- Verification gate: new logic has tests (diff-run orphans and cap, gate carry cases at tests/gate.test.ts:132-203, watchdog test, docker staleContainers/bindMount: 9 references in tests/docker.test.ts). CI runs lint, tsc, test, visual and the compiled-binary browser tests (.github/workflows/ci.yml). No semgrep or gitleaks step in CI (gitleaks is a local hook only).
- Provenance: ledgers under thoughts/ledgers/ with sha256 stamps; no AGENTS.md or CLAUDE.md in the repo, so agent instructions to verify against real files are not in the repo.
- Review gate for large diffs: not evidenced in the repo. The 6 refactor commits (505904a, 8b3e5ae, 98e8bba) moved about 3,000 lines with tests but no recorded second review.
- Verdict: gated by tests and CI; DLT-001 shows tests assert the happy path, not "required evidence missing".

## Skipped areas (unchanged or out of reach)
Unchanged since the prior run and not re-read: redaction (src/lib/redact.ts), lostpixel import, plan/sitemap internals, MCP server beyond summarizeRun, site/ marketing pages, fonts and CSS.

## NOT covered
- Full vitest suite and tsc (load average about 180; only two targeted runs).
- Docker build and run, macOS and Linux `--mount` behavior, real container reaper (DLT-002 is code-walk only).
- Live action run on a real PR; docker=false path.
- Review UI in a real browser beyond the one tests/capture-browser.test.ts case; DLT-007 is a code walk, not reproduced.
- src/ui/review.css, 360-line review.js diff outside the save path, src/lib/capture.ts stress/RTL/redaction changes (partly read).
- semgrep, trivy, gitleaks history scan.

## Counts (prior run end state vs now)

| Severity | Open at 2a8f350 | Open at f977188 |
|---|---|---|
| Critical | 0 | 0 |
| High | 0 | 0 |
| Medium | 0 | 1 (DLT-001) |
| Low | 3 accepted decisions | 6 new, 3 accepted decisions unchanged |

Launch blockers: none at High or above. Smallest next action: make a missing baseline `.aria.yml` a failing row (DLT-001) with a test.
