# repo-map (commit e1568fc, branch feat/spine-doctor-strict-gate-report, tree dirty: untracked only)

Scope: whole repo. Stack: Bun/Node 22.23.1 TypeScript CLI, pnpm 12.6.0, commander, playwright, pixelmatch, pngjs, vitest 5, biome (package.json, .node-version). No DB, auth, payments, hosting, email or AI SDK. AI use: `claude` CLI subprocess only (src/cli.ts:187). Design spec file: none. Prior audits: docs/audits/20261018-0748-e1568fc/precheck.md only.

## Inventory
One app: `spine` CLI (src/cli.ts 461 lines, 10 commands, src/lib/*.ts 20 modules, 3312 lines in src) with a local review server (src/lib/server.ts, 193 lines) and one inline-JS page (src/ui/index.html, 730 lines). 19 test files in tests/. Fixture site: fixtures/demo-site (3 HTML pages + serve.ts). Example: examples/testimoniq/design-spine.json. No monorepo, no routes/API routes/server actions in the Next.js sense (precheck: 0). Roles: none. Integrations: none besides the `claude` binary.

## Capabilities
Test runner yes (vitest, baseline 114/114). Lint yes (biome, clean). Browser: playwright in deps; browser tests exist (tests/*-browser.test.ts). CI: none (no .github, verified `ls .github` fails). Hooks: none. Credentials: none needed.

## Coverage matrix
| area | paths | risk | prompt ids | inspected | gap |
|---|---|---|---|---|---|
| CLI + gate logic | src/cli.ts, src/lib/gate.ts, diff.ts, manifest.ts | med | whole-app, tests | by other auditors | n/a here |
| Review server (loopback HTTP, POST /api/review) | src/lib/server.ts | med | security/whole-app | no (not this module) | routed |
| Review UI | src/ui/index.html | med | a11y, design | no | routed |
| Capture (browser, arbitrary URLs) | src/lib/capture.ts | med | whole-app | no | routed |
| Critique subprocess | src/lib/critique*.ts | med | security | no | routed |
| Evidence/research dumps | design-research/ (538 tracked files, 1.1G on disk), functional-review/ (89) | low | docs, repo hygiene | partial | see REPO-001 |
| Docs | docs/USAGE.md | low | docs | yes (docs module) | |
| Deploy/infra | none | n/a | | | |

## Routing
Recommended order: whole-app, security (server.ts loopback, capture of arbitrary URLs, critique subprocess), tests, a11y (src/ui/index.html), docs, then writing. N/A: auth, payments, database, Supabase, Stripe, Craft, Power Platform, AI-features/multiproviderai (no SDK, only a CLI subprocess), SEO, privacy/GDPR (no users), costaudit, busfactor (not deployed).

## Findings
- REPO-001 | Low | High | design-research/ (538 tracked files, 360 PNGs tracked repo-wide), .git 50M, design-research 1.1G on disk | Run evidence, scraped third-party pages (award-*.json, gallery-*.json, followup-playwright-capture.json 437K) and screenshots live in the source tree of a PUBLIC repo (`gh repo view`: PUBLIC) | Slow clones, mixes product and evidence, possible third-party content reuse (hypothesis, not checked) | Move evidence to a release asset or separate repo; keep a manifest | `git count-objects -vH`
- REPO-002 | Low | High | no .github/, no hooks (precheck "No pre-commit hooks configured") | The repo ships a regression gate but has no CI running lint+test | A regression reaches main unnoticed | Add a workflow running `pnpm lint && pnpm test` | CI green on a PR
- REPO-003 | Low | High | .audit-report.md untracked and not ignored (`git check-ignore` empty) | Audit artifact can be committed by `git add .` | Noise in history | User decision on .gitignore (not edited here) | `git status`
