# Precheck triage (run 20261116-0926-f977188, commit f977188)

Source: `audit-precheck` output in `.audit-report.md` (Commit: f977188), then semgrep re-run to name its hits.

| Check | Result |
|---|---|
| osv-scanner on pnpm-lock.yaml | No known vulnerabilities |
| gitleaks | 0 findings |
| audit-slop (87 files) | 0 hits in every category |
| semgrep p/default | 2 hits, plus 14 scan errors (partial, not clean) |
| trivy fs | Failed (exit 1, no report). Not covered. |

## Semgrep hits

1. `src/lib/start.ts:16`, `spawn-shell-true`. **Rejected (by design).** The `--start <command>` string (src/commands/capture.ts:37) comes from the person running the CLI and has the same trust level as an npm script. It needs a shell for commands like `pnpm dev`. Rung 2.
2. `renovate.json:22`, missing `minimumReleaseAge`. **Accepted, Low.** Renovate can open a PR for a release published minutes earlier. A compromised release would then reach CI before the registry pulls it. Fix: add `"minimumReleaseAge": "3 days"` to the Renovate config, which matches the local pnpm release-age gate. Rung 2.
