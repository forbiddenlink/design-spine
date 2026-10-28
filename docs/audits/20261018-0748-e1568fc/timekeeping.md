# timekeeping audit (e1568fc)

Applies: the tool stores timestamps (run ids, startedAt/finishedAt, approvedAt, updatedAt, comparedAt) and accepts a fixed page clock. No database, no scheduler, no cron, no recurrence, no emails/PDFs, no user timezone. Those items are N/A.

## Summary lines
- Storage: UTC ISO-8601 strings with `Z` everywhere: run id and startedAt/finishedAt (src/lib/capture.ts:473-500), approvedAt (src/cli.ts:253), review updatedAt (src/lib/review.ts:14), comparedAt (src/lib/comparison.ts:180). No naive local timestamps, no date-only values.
- Display: raw ISO strings shown in the review UI (src/ui/index.html:618 `approved ' + comparison.approvedAt`); no `toLocale*`/`Intl` use anywhere (grep). No server/client zone mismatch possible.
- Arithmetic: none (no day math, no 86400000, no start-of-day). Run ordering relies on lexicographic order of UTC ids (runs.ts:40; history.ts:27), valid while the system clock is monotonic.
- Scheduling: N/A (no jobs).
- Test coverage: `TZ=Australia/Lord_Howe LANG=sv_SE.UTF-8 pnpm exec vitest run --maxWorkers=2` -> 19 files, 114 tests pass (my run, /private/tmp/claude-501/ds/vt-tz.txt). Only one test sets `capture.clock`, with a `Z` string (tests/capture-browser.test.ts:40), so the defect below is untested.
- tzdata currency: UNKNOWN (runtime Bun 1.3.13 bundles its own ICU; not inspected). Impact is nil here since no zone conversion is performed.

## Findings

### TIME-001 | Medium | High | src/lib/manifest.ts:100-104; src/lib/capture.ts:303, 273-280
Problem: `capture.clock` is validated only with `Date.parse` (finite check), so a zone-less string like `2026-10-10T12:00:00` passes, but `new Date(...)` interprets it in the machine's local zone. The recipe fingerprint hashes the raw string, so the same recipe hash covers different instants.
Evidence (bun, same string, three zones):
```
UTC                  2026-10-10T12:00:00 -> 2026-10-10T12:00:00.000Z
America/Los_Angeles  2026-10-10T12:00:00 -> 2026-10-10T19:00:00.000Z
Australia/Lord_Howe  2026-10-10T12:00:00 -> 2026-10-10T01:00:00.000Z
```
Impact: a baseline approved on a laptop in one zone and a capture on a CI runner in UTC pass the strict recipe check (`recipeHash` equal, src/lib/gate.ts:55) yet render different dates and times, producing pixel diffs that look like regressions. Date-only strings (`2026-10-10`) are UTC and unaffected. docs/USAGE.md shows only the `Z` form and does not warn.
Fix: require an offset in validation (regex for `Z` or `+hh:mm`), or normalize with `new Date(clock).toISOString()` before fingerprinting and reject zone-less input.
Verification: manifest with `clock: "2026-10-10T12:00:00"` fails `spine doctor` with a clear message; a unit test runs under two `TZ` values.

## Not covered
Behavior of `page.clock.setFixedTime` with timers running (documented in USAGE.md as intentional). DST boundaries: no code path performs zone math.

Smallest next action: TIME-001 validation change (one regex).
