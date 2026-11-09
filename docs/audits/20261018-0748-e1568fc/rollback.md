# rollback audit (e1568fc)

Not deployed: no vercel.json, no hosting, no database, no flag system, no cache layer (cicd.md, migrations.md, featureflags.md in this folder agree). Vercel, ISR, migrations, PITR, DNS and flag sections are N/A. What can be rolled back is the tool's own state and the local binary.

## Layer by layer
| Layer | Rollback path | Verdict |
|---|---|---|
| Code | `git revert`; binary rebuilt by `pnpm build` (1.09 s measured) | ready; no git tags (`git tag` prints nothing) and no changelog |
| Baseline images and manifest | git history if `baselines/` is committed | ready only if committed; `approve` overwrites in place (cli.ts:249) |
| Lint ratchet | git history; `lint --update` refuses to raise without `--force` (lint.ts:96-98, cli.ts:386-391) | good guard, undermined by DI-001 |
| `latest` pointer | recreate with `ln -sfn runs/<id> .design-spine/latest`; `--run <id>` bypasses it | manual, undocumented |
| Review decisions | none (gitignored, see BK-001) | not rollbackable |
| Kill switches | none; N/A for a local CLI | n/a |
| Cache/CDN | none | n/a |

## Irreversible actions
`spine approve` overwriting a baseline PNG when `.design-spine/baselines` is untracked; `spine approve` run against a corrupt baseline manifest (DI-002); `critique` sends screenshots to the model provider through the `claude` CLI (cannot be recalled).

## Findings

### RB-001 | Low | Medium | src/cli.ts:226-261
Problem: `approve` replaces baselines in place with no `--dry-run`, no confirmation, and no retained previous version; the only way back is git.
Impact: if a gated repo does not commit `baselines/`, a mistaken approve cannot be undone. Medium confidence because whether baselines are committed varies by repo (UNKNOWN).
Fix: `--dry-run` listing tiles that would change, and optionally move replaced files to `baselines/.previous/`.
Verification: approve twice, confirm the first PNG can be restored.

### RB-002 | Low | High | src/lib/capture.ts:511; src/lib/runs.ts:50-54
Problem: a bad capture becomes `latest` immediately, with no `spine latest <id>` to roll the pointer back. Owned by ERR-001 (do not double count).

## Time-to-rollback
Code: rebuild 1.09 s measured; Baselines: UNKNOWN (git checkout, not timed); Flag off, cache purge: N/A. No runbook exists; a one-paragraph recovery note in docs/USAGE.md would close it.

Launch blockers: none. (No Critical/High; nothing is deployed.)
