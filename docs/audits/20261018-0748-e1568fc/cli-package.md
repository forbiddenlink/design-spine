# cli-package audit (e1568fc)

Applies: package.json:7-9 ships `bin.spine` -> `./src/cli.ts`. `"private": true` (package.json:4), so the package is never published; RELEASE section is N/A except the private check, which passes.

## Step 0
`jq` of package.json: name design-spine, version 0.1.0, private true, bin ./src/cli.ts, type module, engines node ">=22.12 <23", bun ">=1.3.13"; no main, exports, files, publishConfig.
`npm pack --dry-run --ignore-scripts`: 709 files, 50.8 MB package, 65.4 MB unpacked (output in /private/tmp/claude-501/ds/pack.txt). No `files` field and no .npmignore, so npm falls back to .gitignore and includes `design-research/**` evidence PNGs and Lighthouse JSON, tests, docs. Harmless while private is true; it becomes a leak and bloat the day private is removed. Not a finding.

## Interface checks (bun src/cli.ts, SPINE_CWD in /private/tmp/claude-501/ds/)
- `--help`, `--version` (0.1.0), and every subcommand `--help`: exit 0, stdout. Verified.
- Unknown command / unknown option: stderr `error: unknown command 'bogus'`, exit 1 (commander default).
- Runtime errors go through `guard` (src/cli.ts:40-43, 66-74): one-line `spine: ...` on stderr, exit 2. Bad numeric options exit 2 with a clear line (`--threshold must be a number between 0 and 1.`, `--port must be an integer between 0 and 65535.`). Verified.
- No ANSI color or spinner in src (grep for escape codes / NO_COLOR / isTTY: none). The NO_COLOR/TTY item is satisfied by absence.
- Shell-outs use argument arrays: `execFileSync('git', [...])` (src/lib/capture.ts:87-96), `Bun.spawn([bin, ...])` (src/lib/critique-run.ts:29-44). No string-built shell.
- Secrets: none read or written. Env: SPINE_CWD (cli.ts:37), SPINE_CLAUDE_BIN (cli.ts:187).
- Compiled build: `pnpm build` (design-research/build/ is gitignored, .gitignore:3) took 1.09 s wall, produced a 71 MB binary; `--version` exit 0; `review` served /api/run and /api/comparison, so the embedded comparison worker resolves. This overwrote the existing ignored file design-research/build/spine.

## Findings

### CLI-001 | Low | High | src/cli.ts:40-43, 109; docs/USAGE.md `doctor` row
Problem: `doctor` documents exit 1 for "unfinished/no capturable states" and 2 for invalid configuration, but commander usage errors also exit 1.
Impact: a script that treats 1 as "unfinished coverage" misreads a typo.
Evidence: `spine doctor --bogus` -> `error: unknown option '--bogus'`, `[exit 1]`.
Fix: `program.exitOverride()` plus mapping commander usage errors to exit 2, or document that 1 is ambiguous.
Verification: `spine doctor --bogus` exits 2.

### CLI-002 | Low | High | src/cli.ts (git mode 100644)
Problem: the file named by `bin` has a shebang (`#!/usr/bin/env bun`, line 1) but is not executable: `git ls-files -s src/cli.ts` -> `100644`.
Impact: `./src/cli.ts` fails directly; package-manager linking usually sets the bit itself, so the documented `bun src/cli.ts` path is unaffected.
Fix: `git update-index --chmod=+x src/cli.ts`.

### CLI-003 | Low | High | src/cli.ts:86-88
Problem: `report` checks `existsSync(out)` then `writeFileSync(out, ...)`: no exclusive-create flag, not atomic.
Impact: (a) a dangling symlink passes the existence check and the write goes to the link target (observed: `--out link.html` where link.html -> a missing file wrote that file); (b) a crash mid-write leaves a truncated HTML and the command then refuses to overwrite.
Fix: `writeFileSync(out, html, { flag: 'wx' })`, write to a temp name and rename.
Verification: repeat the symlink case; expect exit 2.

### CLI-004 | Low | High | src/cli.ts:66-74 (guard), 44-64 (numberOption)
Problem: error lines for filesystem and parse failures omit the path or hint: `spine: JSON Parse error: Expected '}'` for a bad manifest (no filename); `spine: ENOENT ... open '.../design-spine.json'` for a missing manifest in `doctor` with no `spine plan` hint (capture has one). `numberOption` prints `between 1 and a finite maximum` for `--concurrency abc`.
Fix: wrap manifest read in doctor with the same hint as capture; reword the message.

### CLI-005 | Low | Medium | src/cli.ts:148
Problem: `--concurrency` has no upper bound (`numberOption(o.concurrency, 'concurrency', 1)`), so `--concurrency 500` opens 500 browser contexts. Not load-tested (high-load runs out of scope); code-read only.

## Not covered
No machine-readable `--json` mode on `diff` (table on stdout, gate reasons on stderr, which is script-friendly enough; `status` prints JSON). Destructive-command confirmation: `approve` overwrites baselines with no `--dry-run` (see rollback RB-001). Release/provenance checks N/A (private).

Smallest next action: CLI-001 (exit code contract), since scripts key off it.
