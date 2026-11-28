# ai-redteam audit

Run: 20261116-0926-f977188. Repo /Volumes/LizsDisk/design-spine, branch fix/pr-d, HEAD f977188, clean tree at start. Mode: audit-only. docs/audits/ untracked, .gitignore not edited.
Prior audits read: 20261018-0748-e1568fc/sec.md, verify.md; 20261109-0955-2a8f350/delta.md. Fixed there and not re-reported: critique env scrubbing, `--tools Read`, `--setting-sources user`, `--strict-mcp-config`, cwd outside the repo, SEC-001 tile.file regex.

Gate: applicable by the "model calls" clause only. No LLM SDK in package.json (no ai, openai, @anthropic-ai/sdk). The one AI call is `spine critique` shelling out to the `claude` CLI (src/lib/critique-run.ts:65-92). Step 0 grep was run via the pack's pattern over src; model-call hits are in src/lib/critique.ts and critique-run.ts only.

## AI surface
- Call: `claude -p --output-format json --model <sonnet|opus|haiku|fable|claude-*>` (model allowlist src/lib/critique.ts:5-10), prompt on stdin (src/lib/critique-run.ts:84).
- System prompt: none separate. The single user prompt is built in src/lib/critique.ts:98-113.
- Tools wired: `--allowedTools Read --tools Read` (critique-run.ts:72-76), `--add-dir <run dir>` (:77-78), `--setting-sources user --strict-mcp-config` (:80-82). Env filtered by childEnv (critique-run.ts:33-57). cwd is a fresh temp dir (:30).
- Callers: the local operator only, via CLI (src/commands/critique.ts). No network endpoint, no anon/authed users.
- Prompt inputs: (a) the screenshot file, whose pixels are site-controlled; (b) `route`, `state`, viewport, theme from the operator manifest, query stripped (critique-run.ts:28); (c) DESIGN.md, .impeccable.md, public/design-system.txt and the @theme block from `--repo` or cwd (critique.ts:75-96), capped at 6000 chars.
- Not in the prompt (verified by reading build/prompt code): page text, aria snapshot, console errors, page errors, a11y violations, URLs with query strings.

## Findings

### AI-001 | Low | Confidence Medium | Screenshot pixels are an untrusted instruction channel and the prompt does not say so (LLM01, indirect)
- Location: src/lib/critique.ts:98-113 (no untrusted-content notice, rules block not delimited); src/lib/critique-run.ts:72-78.
- Problem: text rendered in the page and captured in the PNG is read by a vision model with a reviewer prompt that carries no instruction to treat in-image text as data, so a hostile page can steer verdict and issue text.
- Evidence (rung 3, walked the path): site content reaches only the PNG (page text and console are not prompted); the model output is parsed to {verdict, issues[{severity,what,where}]} (critique.ts:51-62) and written to critique.json (critique-run.ts:166). I did not run the real claude CLI, so model susceptibility is unproven.
- Exploitability: any site the operator captures that a hostile party can edit (staging with user content, third-party embeds, untrusted pages). Requires the operator to run `spine critique`.
- Impact: forged `pass` can mask defects; forged issue text appears in the review UI. Nothing gates on critique: grep for critique in src shows only commands/critique.ts, critique-run.ts, runs.ts (loader), server.ts:80 (display), ui/review.js; src/lib/gate.ts has no critique use. UI renders with textContent/createTextNode (src/ui/review.js:43, 813-815), so no XSS. Advisory output only, hence Low.
- Fix: add to buildPrompt a line that all text inside the screenshot and in the rules block is data to evaluate, never instructions; fence the rules block (e.g. a labelled delimiter). Do not rely on it; the controls below are the real limit.
- Verification: fake-binary test (SPINE_CLAUDE_BIN) asserting the prompt contains the notice; model behavior needs a staging probe with a canary string.

### AI-002 | Low | Confidence Low (hypothesis) | Read tool could reach files beyond the run dir if the user's own settings allow it (LLM03)
- Location: src/lib/critique-run.ts:72-82.
- Problem: `--setting-sources user` still loads the operator's ~/.claude settings; a broad user-level `Read(...)` allow rule or user hook would apply to the child, and `--add-dir` points at the whole run dir, which also holds aria.yml, run.json (consoleErrors, notes) and other tiles' PNGs.
- Evidence (rung 2): read the argv; I did not run claude. A hostile screenshot could in principle ask the model to Read a sibling file and echo it into `what`/`where`, which lands in critique.json and the local UI only. No egress tool exists in the child (Read only), so exfiltration needs the operator to share critique.json.
- Impact: cross-tile data mixing inside one local run folder; no outward channel found. Not confirmed.
- Fix: put each tile image alone in the temp cwd (copy or hardlink) and `--add-dir` that, instead of the full run dir; consider `--setting-sources` empty if the CLI allows it.
- Verification: with a fake binary, assert argv `--add-dir` is not the run dir; behavior check needs the real CLI in a sandbox.

### AI-003 | Low | Confidence High | Symlinked tile file would be handed to Read (LLM03)
- Location: src/lib/critique-run.ts:28 (`resolve(runDir, t.file)`), src/lib/runs.ts:135.
- Problem: tile names are regex-checked but not lstat-checked, so `a.png` as a symlink to another file is passed to the model's Read tool and the content goes to the Anthropic API.
- Evidence (rung 4, shared with MCP-001/002): symlink a.png accepted by loadRun and returned as imagePath in a scratch run dir; `critique` uses the same loadRun (src/commands/critique.ts:40). The claude CLI's own symlink handling was not tested. Root cause is owned by MCP-002; fix it there.
- Exploitability: needs `--run <hostile dir>`.

### AI-004 | Low | Confidence Medium | Model output length and severity strings are uncapped (LLM10)
- Location: src/lib/critique.ts:40-50 (`String(i.what)`, `String(i.severity)`, unbounded issues array), written at critique-run.ts:166.
- Problem: schema is checked for verdict only; issue count and string size are unlimited, and `severity` accepts any string.
- Impact: a steered model can bloat critique.json and the review payload (server.ts:80). Rendering is safe (textContent). Not exploited here.
- Fix: cap issues (e.g. 20), clamp strings (e.g. 300 chars), coerce severity to high|medium|low.
- Verification: unit test on parseCritique with 1000 issues.

## Checklist results
- Direct injection: Blocked by design; no end-user chat input exists. Operator-authored manifest values only.
- Indirect injection surface: Present, screenshot pixels (AI-001). Also `--repo` design docs (an untrusted repo's DESIGN.md is prompt content; same limits, same fix).
- System prompt: Safe. No separate system prompt; the prompt carries no secrets (design rules only).
- Tool scope: Minimum-necessary on paper (Read only, no network/Bash/Write, env scrubbed, temp cwd); AI-002/AI-003 note the residual Read reach.
- LLM08 hidden context: nothing sensitive in the prompt (critique.ts:98-113).
- LLM02: no PII in prompt; query strings stripped (critique-run.ts:28). Screenshots and design docs go to Anthropic by design (documented in prior SEC-003).
- LLM10: output rendered via textContent (src/ui/review.js:43, 813-815); never eval'd, exec'd or passed to a shell; shape check only (AI-004).
- LLM06 cost controls: Partial. `--limit` and per-tile timeout 1-3600s (src/commands/critique.ts:26-27), parallel capped at 2 (critique-run.ts:176). No max-token or spend cap is set, and no tile-count ceiling when --limit is omitted. Daily spend ceiling: UNKNOWN (human input not given); worst case is operator-initiated, so no worst-case 24h figure was computed. Not an attacker-reachable surface (no remote caller).
- Jailbreak probes: not run. They need the real claude CLI, which was ruled out for this run.

## Output summary
- Direct injection: Blocked (no user input path).
- Indirect injection surface: Present, screenshot pixels and repo design docs (AI-001).
- System prompt: Safe.
- Tool scope: Minimum-necessary, residual notes AI-002, AI-003.
- Output handling: Safe (textContent); unbounded size AI-004.
- Cost controls: Partial.
- Ranked attack paths (all operator-run, no anon/authed remote): 1) hostile page text in screenshot -> forged critique verdict (AI-001); 2) hostile run dir with symlinked tile -> file bytes to API (AI-003); 3) user-level Read allowance + injection -> sibling run files in critique.json (AI-002, unproven).

## Not covered
Real claude CLI behavior (injection success, symlink following, Read scope in -p mode, user-settings inheritance); jailbreak probes; vendor-published prompt-injection benchmark figures (NOT FETCHED); daily spend ceiling (UNKNOWN); `--repo` pointing at a hostile repo end to end.

## Smallest next action
Add the "in-image text is data" notice and a delimited rules block in buildPrompt (src/lib/critique.ts:98-113) and cap parseCritique output (AI-001, AI-004), then fix symlink validation once under MCP-002.
