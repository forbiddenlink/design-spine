# sec: security

Same run context as func.md. Single-operator local CLI plus a loopback review server and a composite GitHub Action. Precheck: gitleaks 0, osv clean, trivy 0.

## Precheck semgrep, identified
- Finding: html.security.audit.missing-integrity at site/index.html:10. Line 10 is the data: URI favicon (contains an xmlns http:// string), not an external resource. False positive. The only external stylesheet (line 13, Google Fonts CSS) cannot carry SRI. site/ is not in package.json "files".
- Scan error (re-run, `--metrics off`, config redirected to a temp dir): PartialParsing at src/cli.ts:363, the inline `import('./lib/types.ts').Box` type. Parser limitation, one line unscanned. The second error in precheck was not reproduced with my excludes (node_modules, docs/audits, design-research).

## Findings

SEC-001 | Low | Medium | src/lib/server.ts:19-190, src/ui/index.html (no frame headers or CSP)
Problem: the review UI can be framed by any site. GET / returns only Content-Type, with no X-Frame-Options or frame-ancestors, and the default port 4747 is predictable.
Exploitability: operator must have `spine review` running and visit a hostile page, then click through an overlay. Host check (403 for foreign Host) and Origin check on POST /api/review (403 for Origin evil.com and null) hold, so only framing remains. Not exploited, headers confirmed with curl -D.
Impact: forged approve/reject decisions in review.json, which feed `approve` and the strict gate.
Fix: add `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` on every response.

SEC-002 | Low | Low | src/lib/critique-run.ts:51-68
Problem: `--allowedTools Read` pre-approves Read but does not limit the tool set, and `--setting-sources user` loads the operator's permission allow-list. The prompt carries repo DESIGN.md text and a screenshot of an arbitrary page, both untrusted. The child also inherits the full parent environment (about 50 secret-named variables were visible to a fake claude; names only checked).
Exploitability: needs hostile text in a captured page or design doc plus a broad allow rule in the operator's user settings. Inferred, no real claude run.
Fix: `--tools Read` (listed in `claude --help`), and pass an env allowlist to Bun.spawn.

SEC-003 | Low | Medium | action.yml (install step, default `version: latest`)
Problem: the action pins setup-bun and upload-artifact by SHA but installs `design-spine@latest` from npm by default.
Fix: default to the version matching the action ref, or require an explicit version.

## Checked, no finding
- /img: `..%2F`, `%2e%2e`, `--path-as-is ../`, `%00` all 404; file must be in run.json and realpath inside run dir and end .png (server.ts:82-103).
- Host allowlist: evil.com, evil.com:47991, 127.0.0.1.evil.com all 403. run= param: `..`, `..%2F` 404.
- POST /api/review: bad tileId 400, bad decision rejected, note capped 2000, anchor hash and bounds checked, concurrent writes are synchronous after the body await.
- report HTML: route, state, baseUrl, console and note payloads containing `<script>` and `<img onerror>` come out escaped; CSP meta default-src 'none' (report.ts:52). UI has no innerHTML/eval sinks (grep).
- Path handling: tile.file regex (runs.ts:97), containedPng (comparison.ts:183), realpath checks in report.ts:20.
- Secrets: gitleaks 0 per precheck; no secret printed by any command run.

## Coverage
| area | status |
| server, report, critique spawn, path handling, action.yml, ci.yml | inspected and exercised |
| semgrep re-run | verified (see above) |
| dependency advisories | precheck only (osv clean); held upgrades pixelmatch 8 / playwright 1.64 not re-reported |
| browser clickjacking PoC, real claude critique | not covered |
