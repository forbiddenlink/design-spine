# errorrecovery audit (e1568fc)

Applies partially: the CLI calls an external service (a local browser against a target URL, and the `claude` CLI). Error-boundary, Server Action, offline and React 19 sections are N/A (no React, no Next app; src/ui/index.html is a static review page). Audited: backend resilience and degradation for the CLI and the loopback review server.

## Coverage matrix
| Area | Status | Reason |
|---|---|---|
| Capture when target is down | verified | `--base http://127.0.0.1:1`: per-tile `ERR_UNSAFE_PORT`, run still written |
| Capture when interrupted | verified | SIGTERM at 4 s of a 10-tile run |
| Timeouts on outbound calls | inspected | goto 30 s (capture.ts:322-325), networkidle 8 s (:327), screenshot 10 s (:363), axe 15 s (:411), asset wait 3 s (:237-255); critique has none |
| Retry with backoff | inspected | none anywhere; single attempt per tile |
| Corrupt state files | verified | see DI-001, DI-002; review.json corruption is handled well (runs.ts:61-89, server.ts:175-180 returns 503) |
| Review server crash behavior | inspected | handlers for /api/run and /img call `loadRun` outside try/catch (server.ts:49-50, 89), Bun returns a bare 500 |
| Worker failure | inspected | comparison worker error/exit rejects the job and resets the worker (comparison.ts:79-88); per-tile errors become `unavailable` (comparison.ts:176-178) |

## Findings

### ERR-001 | Medium | High | src/cli.ts:158-162; src/lib/capture.ts:506-511; src/lib/runs.ts:50-54
Problem: `capture` exits 0 whatever happened to the tiles, and the resulting run always becomes `latest`.
Evidence: server down: `Run ...: 2 tiles, 2 flagged`, `[exit 0]`, and `latest` now points at the all-failed run. SIGTERM mid-run (t5): Playwright closes the browser, remaining tiles log `ERROR async newContext: Target page, context or browser has been closed`, final line `10 tiles, 8 flagged`, `exit 0`.
Impact: `spine capture && spine diff` in a script proceeds after a terminated or dead-target capture; `review` and `diff` then default to the failed run instead of the last good one.
Fix: exit non-zero when any tile errored (or a flag `--allow-failures`), and call `setLatest` only when no tile failed, or keep the previous `latest` and print the new run id.
Verification: capture against a closed port exits non-zero and `latest` is unchanged.

### ERR-002 | Low | High | src/lib/critique-run.ts:29-49
Problem: `Bun.spawn(claude ...)` has no timeout or kill, so a hung child blocks `critique` forever (worker loop awaits `proc.exited`).
Evidence: fake binary `sleep 30`; process still running at 8 s with no output.
Impact: Ctrl-C is the only way out; completed tiles are already saved because `critique.json` is written after each tile (:89).
Fix: `Bun.spawn(..., { timeout, killSignal })` or an AbortSignal with a per-tile budget; record `verdict: 'error'`.
Verification: fake hanging binary yields an error entry after the budget.

### ERR-003 | Low | Medium | src/lib/runs.ts:35-44
Problem: when the `latest` symlink is absent (fresh clone, or deleted), the fallback takes the lexicographically newest directory without checking for `run.json`. A hard-killed capture leaves such a directory (run.json is written only at the end, capture.ts:510).
Impact: `spine review` fails with `Missing run.json` instead of using the last complete run. Reasoned from code (rung 3); the SIGKILL case was not run.
Fix: in the fallback, pick the newest directory that contains run.json.

### ERR-004 | Low | Medium | src/lib/server.ts:49-50, 89
Problem: `loadRun` throws on a damaged run.json inside the request handlers with no try/catch.
Impact: the review UI gets a bare 500 rather than the "Preserve the file" style message used for review.json. Code read only.

Cross-references: corrupt-state handling that fails open is DI-001 and DI-002 (data-integrity). No retry exists for transient navigation failures; a user must rerun capture (use `--routes` to limit). Recorded, not ranked as a defect since it is the documented behavior.

## Not covered
Browser crash mid-capture (only the SIGTERM variant ran), real `claude` failures (rate limit, auth), disk-full during writeJson.

Smallest next action: ERR-001.
