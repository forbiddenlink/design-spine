# viability (design-spine @ 5bf16d5)

Mode: built. Owner's goal (learning / income / portfolio): UNKNOWN. Users, revenue, ICP: UNKNOWN (not given). Therefore NO VERDICT; evidence only.

## Step 0 (dormancy)
- Commits in last 90 days: 35 (`git log --since="90 days ago" --oneline | wc -l`); first commit 2026-10-01, burst 10-01, 10-08, 10-09, 10-13, 10-15, 10-18.
- Deployed URL: none confirmed. GitHub homepageUrl empty (`gh repo view`), package.json homepage is the README, Pages API 404 (`gh api repos/forbiddenlink/design-spine/pages`). site/index.html exists but is not shown to be hosted.
- Analytics: 0 hits (`grep -rnE "posthog|plausible|...|@vercel/analytics" package.json src site`, ran, exit clean).
- Not dormant (35 commits), so continued.

## Step 1
Product: a local Bun CLI that screenshots each Next.js App Router route across states, widths (390/1280) and themes, runs automatic checks (overflow, console errors, blank regions, overlays), shows a contact sheet for a human to approve, and fails CI when a screen differs from an approved baseline (README.md:5-9). Painful job as stated: "Most UI gets built and checked in one state" and agents "never open the 390px dark-mode empty state" (README.md:13). Audience stated loosely: Next.js developers using coding agents (README.md:13, site/index.html lede); not a specific ICP. Stage: prototype / pre-release. Public repo, 0 stars, no tags or releases, npm package not published (see RM-001).

## Step 2 (competitors)
Not researched live in this run (write scope limited to this file; competitors.md not written). Alternatives named by the project itself, all NOT FETCHED: Chromatic, Percy, Argos, Playwright `toHaveScreenshot` (README.md "How it compares"). The README comparison cells (e.g. "Plans the route x state matrix: No" for hosted tools) have no source or date; treat them as unverified claims.

## Step 3
- PMF vs problem-solution fit: neither proven by evidence in the repo; no users, interviews or survey. UNKNOWN.
- Activation/retention instrumentation: none (0 analytics hits). Retention: UNKNOWN.
- Sean Ellis: UNKNOWN (no survey result in repo).
- Distribution: UNKNOWN (no referrer data). Observed: the only install path is currently broken (RM-001), so external adoption cannot yet happen.
- Strengths visible in code, not demand evidence: CI with lint, tsc and 19 test files; osv-scanner reports 0 vulnerabilities (precheck.md); coherent differentiator (local, human approval ledger, coverage gaps shown).

## Questions only the owner can answer (UNKNOWN)
Goal for the project; who the first 5 target users are; whether any outside person has run it.

## Output
- Verdict: none (goal UNKNOWN).
- Single biggest risk (evidence-based): nobody outside the checkout can install it (RM-001), so any demand test is blocked.
- Cheapest 2-week experiment if the goal is income or reach: publish v0.1.0, then get 5 Next.js developers to run `plan` + `capture` on their own app and record whether they reach `review` unaided.

```json
[]
```
No viability finding is raised separately; the install break is owned by RM-001 in repo-map.

Coverage: viability: Step 0, 1, 3 done from repo and gh; Step 2 not covered (no live research, NOT FETCHED).
