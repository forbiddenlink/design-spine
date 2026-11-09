# repo-map (design-spine @ 5bf16d5, main, 2026-10-18)

Run context: /Volumes/LizsDisk/design-spine, branch main, SHA 5bf16d5 (git log). Working tree dirty only by untracked design-research/, docs/audits/, examples/testimoniq/.design-spine/ (git status). Scope: whole tracked tree (88 files, `git ls-files | wc -l`). Stack: TypeScript 7 / Bun 1.3.13 CLI, Node >=22.12 launcher, pnpm 12.6.0, Playwright 1.63, pixelmatch, pngjs, commander 15, vitest 5, biome (package.json, pnpm-lock.yaml). No DB, auth, payments, email or AI SDK wired in; critique shells out to the `claude` CLI (src/lib/critique-run.ts). Hosting: none confirmed (GitHub homepage empty, Pages API 404). Mode: audit-only. Env: local only.

## Inventory
- 1 package `design-spine` (bin `spine` -> bin/spine.js -> bun src/cli.ts), 1 composite GitHub Action (action.yml), 1 Claude Code skill (integrations/claude-code/SKILL.md), 1 static landing page (site/index.html), 1 review UI (src/ui/index.html served by src/lib/server.ts).
- 10 CLI commands (src/cli.ts). 19 test files in tests/. No monorepo.

## Coverage matrix
| Area | Path | Risk | Prompt ids | Inspected | Gap |
|---|---|---|---|---|---|
| CLI + gate logic | src/cli.ts, src/lib/{gate,diff,runs,manifest,history}.ts | high (CI gate integrity) | whole-app, tests | partial (read cli.ts excerpts) | not traced end to end |
| Capture engine | src/lib/capture.ts | med | whole-app | no | 581 lines unread |
| Review server + UI | src/lib/server.ts, src/ui/index.html | med (local HTTP, writes review.json) | security | no | not run |
| Critique via `claude` CLI | src/lib/critique*.ts | med (spawns subprocess) | security | no | |
| GitHub Action | action.yml | high (consumers' CI) | supply-chain | yes | see RM-001, RM-002 |
| CI | .github/workflows/ci.yml | low | ci | yes | no build step |
| Docs/site | README.md, docs/USAGE.md, site/ | low | writing | yes | |

## Findings

```json
[
  {"id":"RM-001","area":"distribution/install","severity":"High","confidence":"High","location":"README.md:20, action.yml:33, site/index.html:123","problem":"Every documented install path points at the npm package `design-spine`, which does not exist on the registry (`npm view design-spine` returned E404 on 2026-10-18).","impact":"A new user following the README Quick start fails at step one, and the published GitHub Action fails at `npm install -g` for every consumer. docs/USAGE.md:3 only describes checkout-based use, so the docs disagree.","fix":"Publish the package (or a tagged release), or change README, action.yml and the site to install from the GitHub repo and say the npm package is not published yet.","verification":"`npm view design-spine version` returns a version, then run the README Quick start in an empty Next.js app."},
  {"id":"RM-002","area":"supply-chain","severity":"Low","confidence":"Medium","location":"README.md:75, action.yml:19-20","problem":"Consumers are told to use `forbiddenlink/design-spine@main`, and the action installs `design-spine@latest` by default, so a CI gate follows a moving ref and a moving package version.","impact":"A later change to main or the package can alter or break a consumer's gate without a change in their repo.","fix":"Document a tagged release (and pin by SHA for strict users) once releases exist; default `version` to the action's own version.","verification":"`git tag` is empty today; after tagging, README example uses `@v0.1.0`."}
]
```

## Coverage line
repo-map: inventoried and matrix built; security-sensitive code (capture.ts, server.ts, critique-run.ts) listed but not deep-read. Precheck noted missing .env.example and `.next .vercel` gitignore entries: N/A (no env vars, not a Next.js/Vercel app). docs/audits/ left untracked, .gitignore not edited. Smallest next action: fix RM-001.
