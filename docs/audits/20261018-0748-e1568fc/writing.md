# writing (commit e1568fc)

Applicable: user-facing text exists (CLI output src/cli.ts, review UI src/ui/index.html, docs/USAGE.md). Rendered-state screenshots NOT taken (no browser pass in this module): visual and state-triggered findings are NOT COVERED; only code-verifiable text was checked.

Method: grep of src, docs/USAGE.md for the pack's filler list (seamless, robust, comprehensive, leverage, utilize, elevate, streamline, unlock, delve, cutting-edge, thoughtful, designed to, nuanced): 0 hits. Grep for assistant tells (Please, Oops, Something went wrong, Let's, Sorry, successfully): 0 hits. Em dashes: 3 in src, 0 in docs/USAGE.md.

Total instances: 3.

- WRITE-001 | Low | High | src/cli.ts:378 | Em dash used as separator in `lint --exceptions` output (`${text} — ${reason}`) | House style bans em dashes in copy | Replace with ` : ` or `(reason)` | `spine lint --exceptions` output
- WRITE-002 | Low | High | src/ui/index.html:381 | Em dash separates reason in coverage list (`' — ' + entry.reason`) | Same | Use `: ` or a middle dot already used on that line | read line
- WRITE-003 | Low | Medium | src/ui/index.html:311 | `'—'` is a placeholder glyph for an unavailable percent, not prose | Likely acceptable; flagged only because the pack counts every em dash | Use `n/a` or `--` if the ban is strict | read line

Voice verdict: terse, literal developer tooling copy with no marketing filler; sounds like a real tool by one person. Voice spec: UNKNOWN (none defined). Findings are mechanical only.
