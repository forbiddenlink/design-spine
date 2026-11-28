# mcp-security audit

Run: 20261116-0926-f977188. Repo /Volumes/LizsDisk/design-spine, branch fix/pr-d, HEAD f977188, working tree clean at start. Mode: audit-only. Scope: whole repo. Stack: Bun/TypeScript, @modelcontextprotocol/sdk 1.32.2 (package.json:50, pnpm-lock.yaml:321), pnpm. docs/audits/ stays untracked; .gitignore not edited.
Prior audits read: 20261018-0748-e1568fc/sec.md, verify.md; 20261109-0955-2a8f350/delta.md. SEC-001 (tile.file traversal) and SEC-002/003 (critique env, settings isolation) are fixed or refuted there and are not re-reported.

Gate: applicable. The repo is an MCP server (src/mcp.ts:3-4, stdio transport at src/mcp.ts:117).

## Step 0 inventory
- Server: `new Server(...)` src/mcp.ts:82, transport StdioServerTransport only (src/mcp.ts:117). No HTTP/SSE. Registered through src/commands/mcp.ts:6-9.
- Tools exposed (src/mcp.ts:51-72): `spine_status` (no args), `spine_list_tiles` (optional `status` enum). Both read-only, annotated readOnlyHint. Input validated by hand against the enum (src/mcp.ts:95-98); `additionalProperties:false` in the schema is not enforced by the server handler, extra args are ignored.
- Tools consumed / MCP client use: none (grep for Client transports found only tests/mcp.test.ts). Agent-to-agent calls: none.
- Writes: handler imports only resolveRunDir, loadRun, loadReview, runIdOf, summarizeRun (src/mcp.ts:5). tests/mcp.test.ts has a before/after filesystem snapshot test; ran `vitest run tests/mcp.test.ts --maxWorkers=1`: 11 passed.

## Findings

### MCP-001 | Low | Confidence High | Unvalidated run.json strings reach tool output (ASI01)
- Location: src/mcp.ts:38-47 (spineListTiles returns t.route, t.state, t.viewport, t.theme, t.id, t.imageHash verbatim); src/lib/runs.ts:133-137 (loadRun validates only `tile.file`).
- Problem: every other tile field is passed to the agent unchecked and uncapped, so a hostile run.json injects arbitrary text (or non-string types) into the agent's context as tool output.
- Evidence (rung 4): scratch run.json with `state` = "IGNORE PREVIOUS INSTRUCTIONS ..." + 5000 chars, `viewport:"<script>"`, `theme:{x:1}` through `spineListTiles` returned all three verbatim (state length 5050, viewport string, theme object).
- Exploitability: needs a hostile run directory at `<root>/.design-spine/latest` or the newest `runs/*`. Both are gitignored (.gitignore: `**/.design-spine/runs`, `**/.design-spine/latest`), and the MCP has no `--run` argument, so reach needs a manually copied CI artifact or bundle in the project root. A hostile website cannot set these fields: route/state/theme come from the operator manifest (src/lib/capture.ts:77-78, 422-426), and page text, console and aria output are not in either tool's output. Narrow.
- Impact: tool-output poisoning of the connected agent. The agent holds only these two read-only tools from this server, so blast radius is the agent's other tools.
- Fix: validate tile shape in loadRun (string id/route/state/theme, numeric viewport, hash regex) and cap string length; wrap tool output with a note that fields are data.
- Verification: a loadRun test with oversized/typed-wrong fields expecting rejection.

### MCP-002 | Low | Confidence High | Symlinked tile file accepted; absolute path and symlink target not contained (ASI02)
- Location: src/lib/runs.ts:135 (regex checks the name only); src/mcp.ts:42 (`imagePath: join(dir, t.file)`); src/lib/runs.ts:95 (`realpathSync(link)` for `latest` has no containment under .design-spine/runs).
- Problem: `a.png` as a symlink to another file passes validation, and `latest` may resolve to any directory.
- Evidence (rung 4): symlink a.png -> /etc/hosts in a scratch run dir; spineListTiles returned its path and lstat confirmed a symlink. The MCP itself returns only the path, never file bytes, so it does not read the target. The risk is the consumer: an agent told to open `imagePath` reads whatever it points to, and `spine critique` passes the path to claude's Read tool (see ai-redteam LLM03 note).
- Exploitability: same hostile-run-dir precondition as MCP-001. Narrow; extends the already-fixed SEC-001 from names to symlinks.
- Fix: lstat each tile file and reject symlinks, or realpath and require containment in the run dir.
- Verification: test with symlinked tile file expecting `Invalid tile file`.

### MCP-003 | Low | Confidence Medium | Uncapped tool response and absolute-path disclosure (data minimization)
- Location: src/mcp.ts:38-47, 24-34; src/mcp.ts:104 (`err(e.message)` echoes absolute run.json paths).
- Problem: `spine_list_tiles` returns every tile with absolute paths and no page size; `spine_status` returns `runDir`.
- Impact: a run with hundreds of tiles yields a large response into agent context; home-directory layout leaks to the agent. No secrets: the response contains none, consoleErrors/aria/notes are not returned. Confirmed by reading; not measured with a large run.
- Fix: add a limit/offset (default 200) and return paths relative to the root.

## Checklist results
- ASI01 tool descriptions: static strings in the repo (src/mcp.ts:52-71); no remote tool descriptions consumed. Cross-MCP injection: N/A, no client.
- ASI02 input validation: status enum checked (src/mcp.ts:95-98). Path traversal in tool args: no path argument exists. HTTP auth/Origin/DNS-rebinding: N/A, stdio only. Destructive tools: none. Secrets in output/errors: none returned; `err(e.message)` can include local paths only (MCP-003).
- ASI03 collisions/privilege: names are prefixed `spine_`; no cross-server shadowing risk from this side. Server runs with invoking user's rights and only reads `<SPINE_CWD or cwd>/.design-spine` (src/commands/shared.ts:3).
- ASI07: N/A, no HTTP/SSE, no inter-agent calls.
- ASI04 supply chain: SDK is the only MCP package, pinned exact `1.32.2` in package.json:50 and pnpm-lock.yaml:321. `pnpm audit --prod`: "No known vulnerabilities found" (advisory lookup, 2026-11-16). Postinstall scripts of the SDK tree not inspected.
- Logging/anomaly detection: none. Calls are not logged or rate-limited. Acceptable for a local stdio read-only server; noted, not a finding.
- Computer-use gate: N/A, the MCP server does not drive a GUI.

## Output summary
- Tools exposed: spine_status (read-only, no args), spine_list_tiles (read-only, enum arg, validated).
- Confused-deputy risk: none at file:line beyond MCP-002.
- Inter-agent auth: N/A.
- Supply chain: pinned, audit clean.
- Data minimization: over-broad in MCP-003 only.
- Ranked exploit paths: 1) hostile run dir -> poisoned tile fields in agent context (MCP-001); 2) hostile run dir -> symlinked image path handed to a reader (MCP-002).

## Not covered
Real MCP client interop (no live client run); SDK transitive postinstall review; behavior with 1000+ tile runs; `spine mcp` process-level stdout cleanliness under errors.

## Smallest next action
Extend loadRun's tile validation (src/lib/runs.ts:133-137) to type-check all string fields and reject symlinked tile files; one change closes MCP-001 and MCP-002.
