# Action plan: audit run 20261116-0926-f977188 (commit f977188, branch fix/pr-d)

Mode: audit-only. Modules run:
- delta (with agent-code-trust checks)
- mcp-security and ai-redteam
- container
- a11y, ux and distinctiveness
- precheck triage

The orchestrator re-checked every Medium finding against the code (rung 2 or better). The other findings carry the rung their module reached.

Result: 0 Critical, 0 High, 5 Medium, the rest Low. No launch blocker. No regression since 2a8f350.

## Next PR: gate and container hardening

1. **DLT-001, Medium. A missing baseline structure snapshot passes silently.**
   - Location: `src/lib/aria.ts:52` returns `[]`, used by `diff-run.ts:66` and `:102`.
   - Fix: when the tile has `ariaHash` but the baseline `.aria.yml` is missing, return a failing row such as `structure-missing`. Add a test next to the "orphan baselines" tests in `tests/diff-run.test.ts`.
   - This is a validation zone because it changes what the gate fails on.
2. **CTR-002, Medium. Image tag never changes when the Dockerfile changes.**
   - Location: `docker.ts:159-161` reuses any image with the same tag. The bases at `docker.ts:20-21` are tag-pinned only.
   - Fix: add a hash of `dockerfileText` to `imageTag`. Pin both bases by digest.
   - Ship this before CTR-001, otherwise the CTR-001 fix never reaches users who already built the image.
3. **CTR-001, Medium. The container gets more access than it needs.**
   - Location: `docker.ts:110-117`. The project root is mounted read-write and the container uses `--ipc=host`.
   - Fix: mount the root read-only, with only `.design-spine/` writable. Use `--shm-size` instead of `--ipc=host`. Add `--cap-drop=ALL` and `--security-opt no-new-privileges`. Always pass `--user`.
4. **A11Y-001, Medium. Single-key shortcuts cannot be turned off (WCAG 2.1.4, level A).**
   - Location: `src/ui/review.js:1683`. A document-level keydown handler binds j/k/a/r/u.
   - Fix: add a toggle that turns single-key shortcuts off, and save it in localStorage.
5. **UX-001, Medium. The lightbox screenshot gets about 25% of the viewport height at 390 px.**
   - Location: `src/ui/review.css`, `.viewer-canvas` at lines 848 and 1103.
   - Evidence: shots/ui-lightbox-390.png.

## Low (batch later)

- **Gate:**
  - DLT-004: `tileTimeoutMs` is part of `recipeHash`. Exclude it.
  - DLT-005: orphan baselines are missing from the PR summary, action.yml has no `max-region` input, and no command prunes baselines.
  - DLT-006: a PR that updates a baseline also carries its own approval. This needs a design decision.
  - DLT-003: watchdog edge paths.
- **Review UI:**
  - DLT-007: the Reload button is lost when the status box re-renders, and a later save clears the 409 reason.
  - UX-002: `a` or `r` with no focused tile does nothing and gives no message.
  - UX-003: run-together error copy.
  - UX-004: mid-word route breaks.
  - Unconfirmed: focus may land on `body` after Esc closes the lightbox.
- **Site:**
  - A11Y-002: the install `pre` is not focusable. Add `tabindex="0"` and a label.
  - A11Y-003: the terminal video has no transcript.
  - A11Y-004: small link targets.
  - UX-005: the hero has no link to the demo or the repo.
- **MCP and critique:**
  - MCP-001 and MCP-002: `loadRun` should type-check every tile field and reject symlinked tile files.
  - AI-001: mark in-image text as untrusted in the critique prompt.
  - AI-004: cap the critique output.
  - MCP-003: no limit on tile list output.
- **Container:**
  - CTR-003: no resource limits.
  - CTR-004 and DLT-002: the sweep can remove a live container on a shared daemon. Add a hostname label.
  - CTR-005: platform detection for host networking.
  - `scripts/visual-tests.ts` still uses `-v`.
- **Supply chain:** renovate.json has no `minimumReleaseAge`.

## Rejected

- semgrep `spawn-shell-true` at `src/lib/start.ts:16`: by design, because the operator supplies the `--start` command.
- CTR-006: `bindMount` quoting is not injectable (rung 4).

## Not covered

- Linux CI and Docker Desktop.
- Image rebuild, trivy (failed) and semgrep (partial).
- The real `claude` CLI.
- Screen readers, Firefox and WebKit.
- A live Action run on a PR.
- Competitor comparison.
