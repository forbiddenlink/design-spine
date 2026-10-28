# backup audit (e1568fc)

Partly applies. No database, Supabase, Neon, Stripe or hosted object storage (package.json deps: commander, pixelmatch, playwright, pngjs, axe; no DB driver). Those sections are N/A. The tool does store files: `.design-spine/` in the gated repo and a human review record. Audited as a local file store.

## Backup coverage per data store
| Store | Where | In git? | Recoverable how |
|---|---|---|---|
| Source code | repo, remote exists (CICD audit: public GitHub repo) | yes | git |
| Baselines (`baselines/*.png`, `manifest.json`) | `.design-spine/baselines/` | tracked unless the gated repo ignores it (this repo ignores only runs and latest, .gitignore:4-5) | git history |
| Lint ratchet (`lint-baseline.json`) | `.design-spine/` | tracked | git history |
| Runs and screenshots | `.design-spine/runs/` | gitignored (.gitignore:4) | recapture (needs the app and the same environment) |
| Human review record (`review.json`: approve/reject decisions, notes, note locations) | inside each run dir under `runs/` | gitignored | none, except a manual JSON export or offline report |
| Build output | design-research/build/ | gitignored (.gitignore:3) | `pnpm build` (tested: 1.09 s) |
| Env/config outside the platform | none needed (only SPINE_CWD and SPINE_CLAUDE_BIN, cli.ts:37, 187) | n/a | n/a |

Last restore test: never recorded (no document describes one). Recovery time: UNKNOWN for baselines; rebuild of the binary measured at 1.09 s.

## Findings

### BK-001 | Low | Medium | .gitignore:4; src/lib/server.ts:187
Problem: the only durable record of who approved what and why (`review.json`, with notes and note anchors) lives in the gitignored `runs/` directory. Deleting `.design-spine/runs` (or a fresh clone) loses every decision; `approve` copies only the approved images and a manifest entry with the run id, not the decision or note.
Impact: the audit trail behind a baseline cannot be reconstructed, and `latest`/run ids in the baseline manifest (`run`, cli.ts:252) then point at runs that no longer exist (comparison shows `baseline <run id>` text only).
Fix: persist the review decision with the baseline entry (reviewer note, decision time), or document that reports/exports must be committed or archived for sign-off evidence.
Verification: delete runs/, run `spine diff --strict`; evidence of approval still readable from baselines/manifest.json.

### BK-002 | Low | Medium | src/lib/capture.ts:474-476 (no pruning command)
Problem: every capture writes a full run directory of PNGs and nothing prunes old runs (no `prune`/`clean` command in `spine --help`). Not a data-loss risk but a disk-growth risk; unmeasured on a real project (my runs: 4.8 KB per trivial tile).
Fix: add `spine prune --keep N` or document a manual retention policy.

## Not covered
Whether the gated repos commit `baselines/`: UNKNOWN per repo. Restore drill: N/A beyond the git restore of tracked baselines (not performed).
