# supplychain audit (e1568fc)
Coverage: lockfile, cooldown config, install scripts, registry sources: inspected. `pnpm install --frozen-lockfile`: not run (it writes node_modules; audit-only). Per-package maintainer counts: not covered.

Lockfile: pnpm-lock.yaml tracked, lockfileVersion 9.0, sha512 integrity on entries (lock:12 onward). `grep -E 'tarball:|git\+|codeload'` returned nothing: all registry. No `requiresBuild` entries (grep): no install scripts in the tree.

## SC-001 | Low | High | repo root (no pnpm-workspace.yaml, no .npmrc)
Problem: no `minimumReleaseAge` cooldown configured in the repo; all deps are caret ranges (package.json:15-27) so a fresh malicious release is installable on next lock update.
Impact: low today (lock pins exact versions, 5 runtime deps); rises when bumping DEP-002.
Fix (proposal, not applied): add `minimumReleaseAge` to pnpm-workspace.yaml (pnpm 12.6.0, confirm key in pnpm docs).
Verification: `pnpm install` rejects a version younger than the window.
User-level ~/.npmrc not read (secret-file guard); effective setting UNKNOWN.

## SC-002 | Low | Medium | pnpm-lock.yaml:1-12
Problem: lockfile carries `packageManagerDependencies` pnpm 12.6.0 with @pnpm/exe platform packages; lock changes would not be reviewed because there is no PR gate (see CICD-001).
