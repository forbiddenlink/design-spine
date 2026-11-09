# Gate: design-spine main after #6, #7, #8 (2586319)

Quick tier run against 5bf16d5 (repo-map, viability, writing, func, sec). Every code finding from that run was fixed in #8 and merged; main CI green at 2586319.

Verdict: **GO for owner use and as a local design gate. NO-GO for public distribution until the install path works.**

Open, owner decision:
- RM-001 (High): README, action.yml and site install `design-spine` from npm; `npm view design-spine` returns 404. Publish, or switch docs and the action to a GitHub install.
- RM-002 / SEC-003 (Low): action is documented as `@main` and installs `design-spine@latest`; no git tags. Tag a release and pin both once published.
- WR-002 (Low): competitor comparison cells in README and site have no source or date.

Held on purpose:
- pixelmatch 8: new color metric changes diff counts against every v7-approved baseline. Needs a deliberate rebaseline release.
- playwright 1.64.x, @axe-core/playwright 4.14.0: under 14 days old on 2026-10-18.

Not covered: review UI in a real browser, compiled binary worker, clickjacking proof of concept.
