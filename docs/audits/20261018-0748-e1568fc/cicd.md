# cicd audit (e1568fc)
Coverage: .github (absent), branch protection via `gh api` (readable), Node pin: inspected.

## CICD-001 | Medium | High | .github/ (does not exist)
Problem: no CI workflow. `ls .github` fails; `git ls-files '*.yml' '*.yaml'` returns only pnpm-lock.yaml. Lint, tsc, 114 tests and `pnpm build` run only by hand.
Impact: a regression, including one in the new strict evidence gate (src/cli.ts:271-338), can reach main unnoticed; repo is public (gh api: private=false).
Fix: workflow on PR: `pnpm install --frozen-lockfile`, biome check, tsc --noEmit, vitest run, playwright chromium install; Node 22.23.1 (.node-version:1), pnpm 12.6.0 (package.json:5), bun>=1.3.13 for build. Pin actions by SHA, least-privilege permissions (see gha-workflow-security prompt).
Verification: PR with a failing test goes red.

## CICD-002 | Medium | High | GitHub forbiddenlink/design-spine main
Problem: `gh api .../branches/main/protection` returns 404 "Branch not protected": direct pushes, no required checks, no reviews. Admin-read worked, so this is observed, not UNKNOWN.
Fix: after CICD-001, require the CI check and block force-push; for a solo repo, required-checks-only is enough.

Local/CI parity: engines node ">=22.12 <23" matches .node-version 22.23.1; local node v22.23.1, bun 1.3.13, pnpm 12.6.0 verified.
Not covered: Vercel config (no vercel.json; N/A), E2E against preview (no deploy), env validation (N/A, only SPINE_CWD / SPINE_CLAUDE_BIN, src/cli.ts:37,187).
