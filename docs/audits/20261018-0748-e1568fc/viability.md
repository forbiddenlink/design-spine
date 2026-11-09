# viability (built mode, evidence and proposals only, no decision)

Mode: built.

## Step 0 dormancy
- Commits last 90 days: 31 (`git log --since="90 days ago" | wc -l`). Span 2026-10-01 to 2026-10-13, one author (Elizabeth Stein, 31/31).
- Deployed URL: none. `gh repo view --json homepageUrl` returned "", no vercel.json/netlify.toml/wrangler.toml, package.json is `private: true` with no homepage.
- Analytics: grep for posthog|plausible|gtag|umami|mixpanel|amplitude|@vercel/analytics over package.json and src returned 0 hits (command ran; exit status only from grep no-match).
- Dormant condition needs all three negatives and fewer than 5 commits. Commits are 31, so NOT dormant. Continue.

## Step 1
Product: local CLI that captures route x state x viewport x theme screenshots of a web app, flags layout defects, runs a local approve/reject review, and fails a diff gate against approved baselines (docs/USAGE.md:1-22, design-research/profile.md:3). Job stated: "gates visual changes through local review" (design-research/profile.md:3); the ledger states the goal as a production design gate for Next.js repos (thoughts/ledgers/CONTINUITY_CLAUDE-design-spine-mvp.md Goal). No README states it (see docs finding). Audience: the owner's own repos ("developers and designers reviewing their own permitted repositories", profile.md:5). Stage: prototype used on one real project (testimoniq manifest, commit 6cfe255).

## Step 2 competitors (NOT FETCHED this run; no write allowed outside this file)
Existing evidence in design-research/followup-research.md (dated 2026-10-08, older than 30 days: no, 10 days) lists Chromatic, Percy, Argos as hosted incumbents plus Playwright's built-in screenshot assertions as the DIY workaround. Pricing: NOT FETCHED. Whether a recurring problem exists for the owner: evidence is one real run (commit d05bf06 "cut false flags found on the first real run").

## Step 3
- PMF/retention: UNKNOWN. No instrumentation, no users beyond the author.
- Sean Ellis: UNKNOWN. Distribution: UNKNOWN (no referrer data).

## Evidence summary
Goal UNKNOWN (HUMAN INPUT missing). If the goal is learning/portfolio, the evidence is strong: 31 commits, 114 passing tests, field validation artifacts. If the goal is income, there is no path to revenue in the repo (no pricing, no hosting, no users).
Biggest risk (proposal): the differentiator versus Playwright snapshots plus Argos/Chromatic is local-only review and Claude critique; no evidence yet that anyone but the author wants it.
Cheapest 2-week experiment (proposal): run `spine` on 2 more owned repos and record time-to-first-real-defect; publish a README so a stranger can try it.
Verdict: not issued (strategy module). UNKNOWN pending goal.
Findings: none.
