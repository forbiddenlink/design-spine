# data-integrity audit (e1568fc)

Applies: the tool persists files under `.design-spine/` in the gated repo (runs/ and latest are gitignored, .gitignore:4-5; baselines/, lint-baseline.json and status.json are not). No database, money, soft delete or migrations. Local disposable fixtures only (/private/tmp/claude-501/ds/t2, t3).

## Invariants and where they are enforced
| Invariant | Enforced at | Status |
|---|---|---|
| Approved baseline equals the reviewed screenshot | app: sha256 check before copy (src/cli.ts:236-244) | holds |
| Strict pass requires unmodified current capture | app: hash re-check (cli.ts:301-312, gate.ts) | holds |
| Baseline metadata (recipeHash, provenance, masks) is kept for every baseline PNG | app only | VIOLATED by DI-002 |
| Lint count never silently rises | app only (cli.ts:383-384) | VIOLATED by DI-001 |
| review.json is either valid or preserved untouched | app: loadReview validation (runs.ts:61-89), server returns 503 | holds (observed in code; not re-run) |
| Writes are crash-safe | writeJson uses tmp + rename (runs.ts:28-33) | holds for JSON; not for PNG copies (DI-003) |
| Tile ids unique among capturable tiles | planJobs filename-collision check (capture.ts:70-79) | holds |

## Concurrency
`POST /api/review` handler has no `await` between `loadReview` and `writeJson` (server.ts:175-187), so within one server process updates serialize. Two processes (two `spine review` servers, or server plus CLI `approve`) are read-modify-write with no lock: last writer wins. Low, not ranked.

## Findings

### DI-001 | Medium | High | src/cli.ts:383-384; src/lib/runs.ts:19-25; src/lib/lint.ts:87-93
Problem: `spine lint` fails open when `.design-spine/lint-baseline.json` is unreadable or lacks `count`. `readJson` swallows the parse error and returns null; `base?.count ?? null` then means "no baseline" and `evaluateRatchet(count, null)` returns `ok: true`.
Evidence (fixture t3, baseline 2, 4 offenders):
```
valid baseline      -> "Count rose by 2." exit 1
truncated JSON      -> "Arbitrary values: 4 (baseline none)" exit 0
{"files":{}}        -> "Arbitrary values: 4 (baseline undefined)" exit 0
```
Impact: the ratchet that is meant to block new arbitrary Tailwind values stops blocking, with exit 0 and no error. A git merge conflict in this tracked file (markers make it invalid JSON) is a realistic trigger; I did not reproduce a real conflict.
Fix: distinguish "file absent" (first run, allowed) from "file present but invalid" (exit 2 with the path); validate `count` is a finite number.
Verification: truncated baseline makes `spine lint` exit 2.

### DI-002 | Medium | High | src/cli.ts:235, 260
Problem: `approve` reads `baselines/manifest.json` with `readJson(...) ?? { tiles: {} }`; an unreadable manifest is treated as empty and then overwritten.
Evidence (t2): two baselines approved, manifest replaced with `{corrupt`, then only tile `a` approved: exit 0, rewritten manifest lists only `a__ideal__390__light`; the entry for `b` (recipeHash, provenance, masks) is gone while `b`'s PNG stays.
Impact: silent loss of the metadata the strict gate and mask comparison depend on; later strict runs fail on `b` as "recipe unknown", and non-strict diff loses baseline masks. Recoverable from git only if baselines/ was committed.
Fix: same as DI-001: refuse with exit 2 when the file exists but does not parse; keep the old bytes.
Verification: `approve` with a corrupt manifest exits 2 and the file is unchanged.

### DI-003 | Low | High | src/cli.ts:249-260
Problem: the baseline manifest records no image hash for the baseline PNG, and PNGs are copied with plain `writeFileSync` before the manifest is atomically replaced.
Impact: strict mode verifies hashes of the current capture only (cli.ts:301-312). A baseline PNG that is corrupted or swapped (bad merge of a binary, manual overwrite) is not detected as such. A crash between PNG copies leaves a mix of old and new baselines with an old manifest (benign for the gate, since the recipe check fails closed).
Fix: store `imageHash` per baseline entry and verify it in `diff --strict`; write PNGs via tmp + rename.

## Not covered
Money/dates/migrations N/A. Cross-system reconciliation N/A. Disk-full and power-loss durability (no fsync before rename, runs.ts:31-32): Low, not tested.

Smallest next action: DI-001 and DI-002 share one fix (a `readJsonStrict` that throws when the file exists but is invalid).
