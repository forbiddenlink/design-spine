# secretmgmt: secret management setup

Run 20261018-0748-e1568fc | audit-only | HEAD e1568fc.

## Gate and scope
The module assumes an age/sops store or a hosted manager synced to host env vars. This repo has no hosting target (no vercel.json, no .vercel, no Dockerfile, no deploy config; `git ls-files` shows only src, tests, fixtures, docs, design-research, examples) and no `.sops.yaml`, no Doppler config (precheck: "Doppler: no config"), and no env var consumed beyond two optional CLI toggles: `SPINE_CWD` (src/cli.ts:37) and `SPINE_CLAUDE_BIN` (src/cli.ts:187). No `.env.example` is needed because no secret is read.

Result: mostly N/A. Host-sync, rotation and CI-secret items do not apply (no host, no CI, no secrets consumed by the app).

## Items that do apply
| Item | Status | Evidence |
|---|---|---|
| Secrets the app needs at runtime | N/A | grep of `process.env` in src returns only SPINE_CWD and SPINE_CLAUDE_BIN |
| Source of truth / sops / age key backup | N/A | no `.sops.yaml`, no encrypted store in repo; operator's personal ~/.secrets store is outside this repo and was not opened (out of scope; reading it is blocked by command-guard and not needed) |
| Host env drift (`vercel env ls`) | N/A | no Vercel project linked (no .vercel dir, no vercel.json) |
| CI secrets / OIDC | N/A | no CI config in repo |
| Rotation | N/A | nothing to rotate in-repo; the Claude CLI used by `spine critique` carries its own login outside this repo |
| Local session-state files (storageState) | applies | see SECRET-001 in secrets-scan.md (root cause owned there; not repeated) |
| Leak scanning in the dev loop | partial | gitleaks clean over history and tree (secrets-scan.md), but no pre-commit hook in the repo (precheck "No pre-commit hooks configured") |

## Findings
None new. SECRET-001 (missing ignore patterns for `.env*` and storageState, no pre-commit scan) and SECRET-002 (query string persistence) from secrets-scan.md cover this module's reachable surface.

## Not covered
- The operator's host-level secret store (~/.secrets) and any cross-project key reuse: out of the repo scope and deliberately not read.
- The Claude CLI credential used by `critique`: not inspected.

Smallest next action: none beyond SECRET-001.
