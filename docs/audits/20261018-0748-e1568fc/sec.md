# sec: application security audit

Run: 20261018-0748-e1568fc | Mode: audit-only | Auditor: sec/secrets/secretmgmt/gha batch
Repo /Volumes/LizsDisk/design-spine, branch feat/spine-doctor-strict-gate-report, HEAD e1568fc, working tree dirty (git status at start: untracked .audit-report.md, design-research/implementation-verification/, docs/audits/, examples/testimoniq/.design-spine/).
Stack: Bun/Node 22 TypeScript CLI `spine` (package.json: commander 15, playwright 1.63, pngjs 7, pixelmatch 7.2, @axe-core/playwright 4.13), pnpm lockfile. No Next.js/React/auth/DB/payments in this repo, so the Next.js, Server Action, headers and auth checklist items are N/A (precheck: Server Action files 0, auth library none, next/react not in lockfile).
docs/audits/ and .audit-report.md are untracked; this run folder is the only write (docs/audits/ left untracked, .gitignore not edited). A scratch PoC lived under the session scratchpad, outside the repo.

## Findings

### SEC-001 | Medium | Confidence High | Path traversal through `tile.file` in `approve`, `diff`, `critique`
- Location: src/cli.ts:240 and :249 (approve), :305-318 and :326 (diff), src/lib/critique-run.ts:23 and :41 (critique). `tile.file` comes straight from run.json (src/lib/runs.ts:56-60, no schema check) and is passed to `join(dir, tile.file)` / `join(bdir, t.file)` with no containment check.
- Contrast: the review server (src/lib/server.ts:92-98, :129-132, :149-151), the HTML report (src/lib/report.ts:20-23) and the comparison module (containedPng, src/lib/comparison.ts) all realpath-contain the same field. The CLI write paths are the uncovered ones.
- Evidence (rung 5, reproduced): scratch run folder with run.json `file: "../../../x"` plus review.json `approve`, `SPINE_CWD=<root> bun src/cli.ts approve --run <bundle>`. Output "Approved 1 tiles". A file named `x` appeared two levels above `.design-spine/baselines`, outside the baseline directory, containing the bytes read from a different path outside the run directory. No imageHash needed (hash check at cli.ts:241 only runs if run.json supplies one, which the attacker also controls).
- Problem: a run directory is trusted as data, but `--run <path>` accepts any directory (src/lib/runs.ts:45), so an untrusted or shared run bundle (downloaded CI artifact, teammate zip) can make `approve` copy a readable file to an attacker-chosen relative location, `diff` write a PNG diff outside `<run>/diff/`, and `critique` pass an arbitrary directory as `--add-dir` with the Read tool allowed (file contents then go to the Anthropic API).
- Exploitability: needs the operator to run `spine approve|diff|critique --run <untrusted dir>`; for `approve` the bundle must also carry a review.json with `approve`. Write content is constrained (existing file bytes, or a PNG diff), so this is a narrow arbitrary-write primitive, not code execution. Not reachable through the normal capture-then-approve flow on your own runs.
- Fix: one shared `containedPng(root, file)` (already in comparison.ts) used by every CLI read/write of `tile.file`; reject `..`, absolute and non-`.png` names; validate run.json `tiles[].file` against `^[A-Za-z0-9._\[\]-]+\.png$` in `loadRun`.
- Verification: unit test with `file: "../x"` expecting rejection in approve, diff and critique.

### SEC-002 | Low | Confidence Medium | Manifest is trusted for filesystem path and navigation target
- Location: src/lib/manifest.ts:142-146 and src/lib/capture.ts:297 (`join(cwd, job.state.storageState)`, no containment, `..` and absolute-looking segments accepted); src/lib/manifest.ts:48-53 (baseUrl is any http(s) host, loopback and link-local included).
- Problem: `design-spine.json` decides which local file Playwright loads as session state and which host the browser visits. Screenshots of that host go into run artifacts.
- Exploitability: operator's own manifest = not an attack. It matters only if `spine capture` runs in CI on a manifest from a fork PR (internal-host screenshots become downloadable artifacts; storageState from outside the repo is loaded). UNKNOWN: no CI config exists in this repo (see gha-workflow-security), so no such flow is present today.
- Fix: resolve storageState and require it inside `root`; document that manifests are code; optionally an `--allow-host` list.

### SEC-003 | Low | Confidence Low (hypothesis) | `spine critique` runs `claude -p` with the repo as cwd
- Location: src/lib/critique-run.ts:29-44. No `--setting-sources`/`--strict-mcp-config` style isolation, and cwd is the repo under review.
- Problem: if the repo carries project-level Claude settings (hooks, MCP servers), the child `claude` may load them. `-p` skips the trust prompt. Prompt also embeds route path with query (capture.ts:11 builds `path` from manifest `query`) and repo design docs (critique.ts:90-98), all sent to Anthropic.
- Exploitability: only when critiquing a repo you do not control. Not tested (could not confirm in this audit, no network call made).
- Fix: run the child with an isolated cwd (the run dir) and minimal settings; strip query strings from the prompt meta.

## Reviewed, no finding (evidence)
- Command injection: only child process is `execFileSync('git', [...])` (src/lib/capture.ts:48,53, argv array) and `Bun.spawn([bin, ...])` (critique-run.ts:29, argv array, prompt on stdin, model checked by assertClaudeModel). grep for exec/spawn/shell: no shell strings.
- Review server (src/lib/server.ts): binds 127.0.0.1 (:15-16), rejects non-localhost Host (:21-22, DNS rebinding), POST refuses mismatched Origin (:105-107), `/img/` requires tile membership plus realpath containment plus `.png` (:89-98), run id regex plus realpath parent check (src/lib/history.ts:8-11), note capped 2000 chars (:185), decision enum checked (:119-126). Residual: a POST with no Origin header is accepted (same-user local process only); GET `/api/comparison` is an unauthenticated CPU-heavy job reachable by any page that guesses the port (cross-origin reads blocked, DoS only, Low, not filed).
- HTML report XSS: every interpolated value passes `escapeHtml` (src/lib/report.ts:6-10, :35-47 and the template), images are data: URIs, CSP `default-src 'none'; img-src data:` set in the document. Viewer UI: no innerHTML/outerHTML/document.write/eval in src/ui/index.html (grep, 0 hits); text set via `textContent` (el helper, line 252); image src built with `encodeURIComponent`.
- Prototype pollution: manifest `object()` whitelists keys (manifest.ts:7-16); `mergeReview` spreads into a fresh object and writes only tile ids already in run.json (server.ts:115-117). No deep-merge helper in src (grep Object.assign/__proto__: 0 hits).
- Untrusted URL handling: validateManifest rejects non-http(s) and credentialed baseUrl (manifest.ts:48-53), route paths must start with `/`, no `//`, `?`, `#`, `\` (:113). Navigation is `baseUrl.replace(/\/$/,'') + path` (capture.ts:322), so path cannot change host. file:// not reachable by manifest.
- Worker/IPC: worker receives only `{runDir, run}` from the server thread (comparison.ts:106 / comparison-worker.ts:5); runDir is a server-validated path.
- Dependencies: osv-scanner 0 vulns (precheck), my trivy run 0 HIGH/CRITICAL on pnpm-lock.yaml.
- Fixture server fixtures/demo-site/serve.ts: test-only, binds all interfaces by default; `%2f` traversal attempt returned 500, `%2e%2e` returned 404, no file served outside public/ (curl against a local instance, then stopped).

## Scanner ground truth
- Semgrep p/default (metrics off, CLI /opt/homebrew/bin/semgrep): 0 findings across the repo (excluding node_modules, .tool-cache), 1 scan error: src/cli.ts:284 `import('./lib/types.ts').Box` is a Syntax error for the TS parser (PartialParsing). The precheck's "1 finding" is this error, not a rule hit. Coverage gap: Semgrep did not fully parse src/cli.ts; I read all of cli.ts by hand instead (rung 2).
- Trivy: precheck run FAILED (exit 1, no report). My rerun `trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --skip-dirs node_modules .` exited with a report: 0 vulnerabilities in pnpm-lock.yaml and in design-research/.tool-cache/_npx/*/package-lock.json (untracked cache); no secret or misconfiguration results were reported.

## Coverage matrix
| Area | Status | Reason |
|---|---|---|
| CLI args / path handling | inspected + one verified PoC | SEC-001 |
| Config (manifest) validation | inspected | SEC-002 |
| Child processes | inspected | none shell |
| Review server + IPC | inspected | none |
| Report/viewer XSS | inspected (static) | no rendered-browser exploit attempt |
| Playwright navigation | inspected (static) | no live capture run |
| Next.js/React/Server Actions/headers/auth | N/A | not in this repo |
| Dependencies | verified | osv 0, trivy 0 |
| Semgrep on src/cli.ts | partial | parser error |
| Live-browser XSS PoC, hostile page capture | not covered | would need running hostile site |

Smallest next action: add one containment helper for `tile.file` and use it in approve, diff, critique (SEC-001).
