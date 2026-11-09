# docs (commit e1568fc)

Outputs
- Gitignore: Has gaps. Ignores node_modules, design-research/.tool-cache/, design-research/build/, runs, latest, .DS_Store. Missing .env*, *.log, coverage (.gitignore, 7 lines). Low impact: no env files are used (only SPINE_CWD at src/cli.ts:37 and SPINE_CLAUDE_BIN at src/cli.ts:187). Real secrets in git history: precheck gitleaks 0 findings.
- .env.example: N/A-ish. Missing, but only two optional env vars exist.
- README quality: Missing (no README.md; `ls` confirms). docs/USAGE.md (149 lines) carries command reference, so "Partially useful".
- Documentation freshness: Slightly stale. USAGE.md commands match src/cli.ts options (checked capture, diff, lint, status, critique flags at src/cli.ts:140-190,266-275,365-372,411-414). Stale items below.
- Cold-start recovery estimate: 15-30 min (install steps exist at docs/USAGE.md "Start and verify locally"; no architecture overview outside design-research/profile.md).
- README 6-10 pointers (deploy, decision log, runbook, dependency rationale, cost map): all absent; project is not deployed so deploy/runbook/cost are N/A. Decision log partial: thoughts/ledgers/CONTINUITY_CLAUDE-design-spine-mvp.md "Key decisions".

Findings
- DOC-001 | Medium | High | repo root (no README.md); gh repo view: visibility PUBLIC | A public repo has no entry-point doc stating what it does, install, or license | Strangers and future-you must find docs/USAGE.md; no 10-second product statement | Add a short README linking docs/USAGE.md | New reader can run `plan` from README alone
- DOC-002 | Low | High | docs/USAGE.md:4 | Invocation hardcodes `/Volumes/LizsDisk/design-spine/src/cli.ts`; 45 tracked files contain /Users/ or /Volumes/LizsDisk paths | Not portable | Use `bun <path-to-checkout>/src/cli.ts` or `pnpm spine` (package.json script `spine` exists) | read line
- DOC-003 | Low | High | repo root, package.json (no `license` field, no LICENSE file) | Public repo without a license | Default copyright, unclear reuse | Owner decision on license | `ls LICENSE*` no match
- DOC-004 | Low | High | docs/USAGE.md:32 vs src/cli.ts:37 | SPINE_CLAUDE_BIN documented, SPINE_CWD (sets project root) is not | Undiscoverable override | Add one line | grep SPINE_CWD docs returns none
- DOC-005 | Low | Medium | design-research/profile.md:9 | States "No Node runtime pin exists" but package.json engines and .node-version (22.23.1) now pin it | Stale frozen doc, per docs-rot a closed-record doc, flag only | Add a freshness stamp or ignore | read both
