# Cleanup, fix and improve plan

Written against: cc8ae48 (main, 2026-11-16). Before executing, compare with HEAD and re-check every `file:line`.

Each finding carries its evidence rung: **R4** = reproduced by running code, **R3** = code path traced end to end, **R2** = cited from a reviewer read, not yet traced by hand. Tag `introduced` never applies here; everything is pre-existing.

## State found

- 5,710 lines of TypeScript in `src/`, plus 1,826 lines in `src/ui/review.js` and 1,476 in `review.css`. There are 33 test files with 329 tests.
- Lint and `tsc --noEmit` pass. CI on main is green.
- An end-to-end walk on `fixtures/demo-site` worked (R4): doctor, capture (12 tiles, 4 flagged as intended), review API approve and reject, approve, diff, `diff --strict`, `--require-baselines`, report, status and lint.
- Review server hardening checks out (R4): a foreign Origin gets 403, and `/img/..%2F` traversal gets 404.

## Fix plan (bugs), ranked

| # | Finding | Evidence | Fix |
|---|---|---|---|
| F1 | **The action leaves a stale PR comment when capture fails.** The `Compare` step has no `if: always()`, so no summary gets written. The comment step exits 0 on an empty summary, and the previous push's green comment stays on the PR. | R3 `action.yml:68,121` | Run `Compare` with `if: always()`, or write a failure summary when capture fails. The comment step should post "capture failed" instead of exiting. |
| F2 | **`--strict` passes byte-identical tiles that have new findings.** The carry-over at `gate.ts:55-58` waives review when the pixels match the baseline. Automatic flags (console or page errors, HTTP 4xx/5xx, request errors, overflow) are never consulted, so a new JS error that changes no pixels passes. | R3 `gate.ts:41-66`, `runs.ts:158` | Do not carry approval when `flagReasons(tile)` is non-empty. Add a gate test. |
| F3 | **`--start` orphans the dev server on Ctrl-C.** The child is `detached` (its own process group), and cleanup is only `process.on('exit')`, which does not fire when a signal kills the process. | R3 `start.ts:16-42`, reviewer ran R4 | Add `SIGINT` and `SIGTERM` handlers that call `stop()` and then exit with 130/143. |
| F4 | **Approving a failed capture blocks every promotion.** The server accepts `approve` on a `tile.error` tile when a note is given. `spine approve` then throws on that tile and promotes nothing. | R3 `server.ts:206`, `cli.ts:464` | Return 422 from `/api/review` for approve when `tile.error` is set. |
| F5 | **The local test suite is flaky.** The first run had 13 files whose workers never started (default workers, 20 spawned at about 10 s startup each). The rerun with `--maxWorkers=4` had 3 timeouts in `cli.test.ts`. The isolated rerun had 1 different timeout (the critique test took 7.2 s against the 5 s default). The same CLI call takes 0.35 s outside vitest. | R4 | Set `testTimeout: 20000` and a `maxWorkers` cap in `vitest.config.ts`. Investigate where the in-vitest 7 s goes. |
| F6 | **Dropped screens go unnoticed by the gate.** `manifestHash` is written (`capture.ts:131`) but never compared. Baselines with no tile in the run are never reported. | R2 | Under `--strict`, fail on a `manifestHash` mismatch and on orphan baselines. Always warn on orphan baselines. |
| F7 | **The review UI hides the server's error text.** `review.js:992` shows `HTTP <status>`, so a 409 "screenshot changed" offers a retry that can never succeed. | R2 | Show `error` from the JSON body. On 409, prompt a reload instead of a retry. |
| F8 | **The diff threshold is a whole-page ratio.** 0.2% of a 1280x6000 page is about 15k px, so a changed button passes. | R2 `diff.ts:67-71` | Add a largest-changed-region cap, in px, alongside the ratio. |
| F9 | **There is no tile watchdog.** A page stuck in a script loop hangs the whole run, and `run.json` is never written. | R2 `capture.ts:377,668` | Race each tile against a deadline, close its context, and record `error`. |
| F10 | Small error-path issues | R2 | Bad manifest JSON gives a bare SyntaxError (`cli.ts:314`). An unknown run id gives a raw ENOENT (`history.ts:10`). `status` swallows a corrupt review or lint baseline, against USAGE.md:38 (`cli.ts:865-870`). Fix: add the file name to each error, and give `guard` a `SPINE_DEBUG` stack switch. |
| F11 | Docker | R2 | No `--name` on the container, so a SIGKILLed parent leaks the container. `-v root:/work` breaks on paths containing `:`. |

## Cleanup plan (dedupe, dead code, hygiene)

Refactor first, in commits separate from behaviour changes, with tests green between each:

1. **`resolveTileImage(runDir, tile)` in `runs.ts`.** It replaces the realpath, prefix and `.png` containment copies at `server.ts:114,149,168`, `report.ts:62` and `comparison.ts:226`.
2. **`sha256(bytes)` in `lib/`.** It replaces the inline copies at `cli.ts:466,474,505`, `server.ts:153,180` and `capture.ts:642,647`. One helper already exists at `cli.ts:530`.
3. **`summarizeRun()` in `lib/status.ts`.** It replaces the parallel load-and-count code in `cli.ts` `status`, `mcp.ts:22-37` and `report.ts:41-48`.
4. **Shared comparison core.** The mask union, the subtle-change logic and the aria diff are duplicated between `cli.ts` diff (~581-636) and `comparison.ts:165-184`. Extract `compareTile()`.
5. **Split `cli.ts`.** It is 896 lines, with 13 commands and logic inline. Move to `src/commands/<name>.ts`, plus `lib/diff-run.ts` (the 150-line diff loop, so it no longer needs `process.exit`), `lib/baselines.ts` and `lib/plan.ts`.
6. **One `loadRun` per POST in `server.ts`.** It currently runs 3 times (133, 145, 165).
7. **Dead code.**
   - Remove `idFromFile` and `tileLabel` (`names.ts:39,41`).
   - `capture.ts:760` duplicates `runIdFromDate`, so use the helper.
8. **Ad-hoc tile key** in `markUnappliedDarkTheme` (`capture.ts:811`). Use `tileId`.
9. **Repo hygiene** (untracked, local only):
   - `design-research/field-validation` is 282 MB of ignored captures.
   - `dist/` is 68 MB.
   - `scratch/`, `functional-review/` and `.audit-report.md` (from 2026-10-18) are leftovers.
   - Archive `thoughts/ledgers/CONTINUITY_CLAUDE-design-spine-mvp.md`. Its Phase 3 and 4 items are stale, so move them to issues.
10. **Local install is blocked until 2026-11-19.** Dependabot's hono bump (#38) is younger than the 7-day `minimumReleaseAge`. It needs no action, and it clears on its own.
11. **CI never builds the compiled binary.** `pnpm build` (`dist/spine`) is not run in `ci.yml`, although the review assets must be embedded in it. Add a build plus a `dist/spine --version` smoke test.

## Improve plan (features), ranked by value per effort

Research summary: Lost Pixel was sunset in April 2026 (secondary sources, primary not checked). Argos, Chromatic and Percy are hosted. Agent-oriented tools (UI Verify, SnapVisor, TestivAI) are hosted MCP services. Design Spine is different: it is local, plans a route x state matrix, runs deterministic checks that name the culprit element, and requires a human approval gate.

Already present (verified by grep): masks, frozen clock, reduced motion, `animations: disabled` in planned manifests, a scroll-through pass for lazy content, `document.fonts.ready`, stability retries, and docker font parity.

1. **Diff view modes in the inspector.** Add side by side, onion-skin slider and a heatmap next to the existing blink (`b`). This is the biggest human-review speedup. Effort: medium.
2. **Agent-sized MCP output.** Add a `changed_tiles` tool that returns a changed-region crop, bounding boxes and a text reason per tile, plus a `spine diff --json` mode. Agents should not need full screenshots. No self-approve. Effort: low to medium.
3. **PR status check.** Set a commit status (failed on drift, pending review, success once the approved baselines are committed) so branch protection can require it. Effort: medium.
4. **Group by cause and bulk approve.** One dependency bump changes 40 tiles. Group tiles by identical diff signature and approve them with one note. Effort: medium.
5. **Better overflow culprit.** It currently reports "from div". Emit a short CSS path or the nearest element with an id or class. Effort: low.
6. **Seeded `Math.random`** via an init script when `capture.clock` is set. Effort: low.
7. **`spine init`** for a first run with zero config: plan, doctor, a capture with `--start` detected from `package.json`, then review. Effort: low.
8. **UX papercuts.**
   - Add an `event.repeat` guard on `a` and `r`.
   - Add a `?` shortcut sheet.
   - List `b`, `←` and `→` in the legend.
   - "Next pending" with none pending should say so.
   - `approve` with 0 approved tiles should point to `spine review`.
   - `--concurrency` help prints its default twice (`(default: CPU cores, 4 to 8) (default: "8")`).
   - `diff --strict` prints up to 4 lines per tile, so group the output per tile.
9. **Action `name-suffix` input** so matrix jobs do not collide on artifact names. Effort: low.

## Distribution

- Write a "Migrating from Lost Pixel" page, titled to match search.
- List the MCP server on the MCP registry, glama.ai and mcpservers.org.
- Add a Claude Code, Cursor or Codex snippet to `integrations/`.
- List the Action on the Marketplace.

## Order of work

1. **PR A (fixes, smallest risk):** F1, F2, F3, F4, F5. Each fix comes with a failing test first.
2. **PR B (refactor only):** cleanup items 1-4, 6 and 7. Behaviour must be unchanged.
3. **PR C:** split `cli.ts` (cleanup item 5).
4. **PR D:** F6-F11.
5. **Feature PRs:** in the improve order above. Each one is its own PR.

Validation zones: the action change (F1) and the gate change (F2) alter what CI accepts. Both need the action e2e workflow (`action-e2e.yml`) green, and a human review before merge.
