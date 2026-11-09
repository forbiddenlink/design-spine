# secrets-scan: secrets and credential hygiene (working tree + full history + CI)

Run 20261018-0748-e1568fc | audit-only | HEAD e1568fc, branch feat/spine-doctor-strict-gate-report | git repo, 42 commits (`git rev-list --count --all`).
No secret values are printed here; hits are named by detector, file and commit only.

## Scanner results (ground truth)
| Scan | Command | Result |
|---|---|---|
| gitleaks, all history | `gitleaks detect --source . --log-opts='--all' --redact` | 42 commits, ~15.8 MB, "no leaks found" |
| gitleaks, working tree | `gitleaks dir . --redact` | ~118 MB, "no leaks found" |
| trufflehog, all history, offline | `trufflehog git file://. --no-verification --json` | 1 candidate, unverified: detector Box, commit fcca553, design-research/lighthouse-comparison-mobile.json |
| trufflehog, working tree, offline | `trufflehog filesystem . --no-verification` (node_modules and .git excluded) | 11 candidates, all in design-research/.tool-cache/_cacache (gitignored npm cache blobs): 10 Box, 1 DatadogApikey |
| trivy fs | `trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL` | no secret results |

Verification of trufflehog candidates: I used `--no-verification` on purpose (the shell alias `trufflehog` adds `--only-verified`, which calls providers with any found credential; I called the binary via `command` to skip it). The Box hit at fcca553 sits in a Lighthouse JSON whose long strings are base64 JPEG `data:` URIs (pattern lines checked with values replaced by `<LONG>`): false positive, rung 4 for "not a Box token shape in context", not live-verified. The .tool-cache hits are inside an untracked, gitignored npm content cache (`.gitignore:2 design-research/.tool-cache/`, `git ls-files design-research/.tool-cache` = 0 files), random package payloads; not reachable from the repo history. Not live-verified (offline by choice).

## Findings

### SECRET-001 | Low | Confidence Medium | No guard against committing session state or env files
- Location: .gitignore (whole file, 7 lines: node_modules, design-research/.tool-cache/, design-research/build/, `**/.design-spine/runs`, `**/.design-spine/latest`, .DS_Store, fixtures/demo-site/.design-spine). Precheck: ".env .next .vercel" not ignored, `.env.example` missing, "No pre-commit hooks configured".
- Problem: the tool's own workflow uses Playwright `storageState` files (manifest field, src/lib/manifest.ts:137-146, capture.ts:297), which hold cookies and tokens for the app under test, and writes `.design-spine/baselines/` screenshots (not ignored; `examples/testimoniq/.design-spine/` is currently untracked, not ignored) that can show authenticated pages. Nothing ignores storageState JSON or `.env*`, and there is no pre-commit scanner (gitleaks is installed but no hook in repo).
- Evidence the leak has not happened: 0 tracked files match storage/cookie/auth names except two `sessions.json` evidence files, and gitleaks reports clean over history.
- Exploitability: self-inflicted, needs a future `git add` of such a file. Impact is session takeover of the tested app if pushed. The repo is public per cicd.md (`gh api` private=false, read by another auditor; I did not re-check), so a mistaken push would be world-readable.
- Fix: add `.env*`, `*storage-state*.json`, `**/storageState*.json` to .gitignore, document the storageState path in a README or doctor warning, enable a gitleaks pre-commit (lefthook). `spine doctor` could warn when a referenced storageState file is git-tracked.

### SECRET-002 | Low | Confidence Medium | Capture query strings persist into run artifacts and the Claude prompt
- Location: src/lib/capture.ts:49 (`withQuery` appended to `path`), run.json `tiles[].path` (capture.ts:231), src/lib/critique-run.ts:27 (`route ${t.path}` in the prompt sent to the Claude CLI), UI export (src/ui/index.html export handler embeds `state.run`).
- Problem: a manifest `query` such as a preview or magic-link token is written to run.json, the exported review JSON and the critique prompt. Run folders are ignored by git, but exports and critique prompts leave the machine.
- Exploitability: only when the operator puts a secret in `query`; no example manifest does (checked examples/testimoniq/design-spine.json and fixtures/demo-site/design-spine.json: grep for `"query"` returned none).
- Fix: strip or redact the query component in run.json `path` display and in the critique meta; keep the real query only in memory.

## Other checks
- Tracked secret-like filenames (`.env*`, `*.pem`, `*.key`): `git ls-files -- '*.env*' '*.pem' '*.key'` returned none.
- CI config: no `.github/workflows` or other CI files exist (find, git ls-files), so no CI secret exposure to review here (see gha-workflow-security).
- Source reads only SPINE_CWD and SPINE_CLAUDE_BIN from env (src/cli.ts:37, :187); no API keys handled by this tool.
- Husky/lefthook: none configured (precheck).

## Not covered
- Remote branch history on the public remote: not scanned (local history only, all refs).
- Live verification of the 12 unverified trufflehog candidates: skipped deliberately.
- Untracked design-research/implementation-verification/ and docs/audits/ were inside the filesystem scans but their contents were not read by hand.

Smallest next action: add `.env*` and storageState patterns to .gitignore and wire gitleaks into a pre-commit hook.
