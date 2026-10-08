# Peer feature research

Nine category peers discovered through web search and loaded on their public key pages in Playwright. Raw rendered evidence: `peer-*.json`; screenshots: `screenshots/references/peer-*.png`. These are advertised/documented capabilities, not independently tested claims. The inventory covers features visible on the loaded pages; paid/authenticated capabilities beyond those pages remain unknown.

| Peer / loaded page | Visible feature inventory | Fit for Design Spine |
| --- | --- | --- |
| [Chromatic](https://www.chromatic.com/) | Visual, interaction, accessibility checks; real-browser states/themes/viewports; Storybook/Vitest/Playwright/Cypress integration; parallel runs; explicit sign-off, comments, reviewer assignment/defaults; Git/CI checks; Slack/Figma/webhooks; searchable component library; shareable docs; branch/commit history; permalinks. | Search, progress, readable verdicts, contextual feedback. Hosted teamwork needs approval. |
| [Percy](https://percy.io/) | Web/mobile visual review; App Percy; URL visual scanner; automated QA; code-change comparison; SDK integrations; BrowserStack sign-in; demo and docs. | Clear evidence-to-verdict journey. Paid browser infrastructure needs approval. |
| [Argos](https://argos-ci.com/) | Deterministic capture; pixel and text-file diffs; ARIA snapshots; side-by-side review; pinned comments and replies; individual reviewer verdicts; PR status; Slack/Teams/Discord notifications; flake history and scoped ignore; Playwright traces/failure images; static previews. | Triage and review progress now; baseline viewer can be a later additive feature. Collaboration, cloud and persistent annotation model need approval. |
| [Applitools](https://applitools.com/) | Visual/functional/cross-browser/cross-device/component/accessibility/API/PDF testing; Eyes; no-code Autonomous; cloud, dedicated cloud, on-prem; SSO/SAML; framework/SCM/CI/bug-tracker integrations; trial/demo. | Local diagnostics and clear context fit. Do not add enterprise services or reproduce unverified AI claims. |
| [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) | Screenshot assertions; expected/actual images; retries until consecutive matches; baseline updating; project-specific snapshots; allowed pixel difference; screenshot styling; text/binary snapshots. | Already uses Playwright; preserve explicit baseline promotion and explain evidence. |
| [BackstopJS](https://github.com/garris/BackstopJS) | Viewport/scenario configuration; reference/test/approve workflow; HTML reports; CLI/CI; selective approvals; ready selectors/events; pre/post scripts; cookies; hover/click/key interactions; hide/remove selectors; thresholds and same-dimension checks; Docker consistency. | Local review, route/state grouping, convenient image inspection. Keep intentionally broken fixtures. |
| [Loki](https://loki.js.org/) | Storybook visual testing; reproducible tests; Docker Chrome, local Chrome, iOS simulator, Android emulator; configuration and command-line docs. | Keyboard-efficient local UI; no extra platform setup in this upgrade. |
| [reg-suit](https://reg-viz.github.io/reg-suit/) | Image comparison and HTML report; external snapshot storage; CLI/local/CI; parent-commit baseline detection; GitHub PR comments; plugin ecosystem. | Downloadable local review report now. Cloud storage/integration needs approval. |
| [SmartUI](https://www.testmuai.com/visual-testing-tool/) | Web/mobile/PDF/Figma comparison; AI difference classification; ignore moved/dynamic regions; manual masking; root-cause explanation; severity ranking; Jira/Slack export; plain-language tests; branch baselines; SDKs; real devices; layout testing; agent skill/MCP; framework/CI integrations. | Surface capture warnings/errors and critique where decisions happen. Accounts, cloud and paid APIs need approval. |

## Ranked gaps

1. Reliable save feedback and recovery: current errors silently lose decisions/notes.
2. Route search, route navigation, status/viewport/theme filters: reviewers must locate evidence quickly.
3. Visible review progress and explicit approved/rejected/pending labels: never confuse automatic clean checks with human sign-off.
4. Accessible image viewer with fit/actual size, next/previous, keyboard focus management.
5. Loading, failure, empty-run and no-results states with concrete recovery.
6. Local JSON report export, including all evidence and confirmed review decisions.
7. Warning and diagnostic details visible on request; screenshot load failures recoverable.
8. Explicit completion feedback without automatically promoting any baseline.

Not in this pass: bulk approvals (too easy to bless unseen screenshots); cloud collaboration, paid services, credentials, schema changes; changes to existing URLs; deletion or modification of capture artifacts. Refer to needs-approval.md.
