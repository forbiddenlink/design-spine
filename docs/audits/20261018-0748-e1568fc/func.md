# func audit (e1568fc)

Mode: audit-only. Repo is a CLI (package.json:7-9 `bin.spine`), so per the prompt the public entry points were tested instead of browser flows. Browser UI flows (review app) were not driven in a browser: NOT COVERED. No auth, payments or server mutations beyond the local review server.

## Coverage matrix
| Area | Status | Evidence |
|---|---|---|
| plan -> doctor | verified | fixture app/ with static, dynamic and route-group pages: plan listed `/`, `/about`, `/blog/[slug]`; second plan exit 2 "exists. Pass --force"; doctor printed `8 capturable, 40 unfinished` |
| capture | verified | local `python3 -m http.server` page, 2 tiles, 5 runs, all 200; server down gives per-tile errors (see errorrecovery ERR-001) |
| approve / diff / diff --strict | verified | fixture runs: approve copied 2 tiles; strict diff lists `pending review`, `capture recipe unknown or differs from baseline`, `baseline provenance unknown or incompatible` for the tile without a baseline entry |
| report | verified | writes file; refuses second write (exit 2); see CLI-003 |
| lint / status | verified | ratchet raised/held; defect DI-001 |
| review server (compiled binary) | partial | HTTP only via fetch: /api/run 200, /api/comparison statuses `unchanged`, bad Host 403, cross-origin POST 403, bad JSON 400, traversal `/img/..%2F..%2Frun.json` 404 |
| critique | partial | bad model exit 2, missing binary exit 2, hung binary never times out (ERR-002); real vision call not run (sends data to a model provider) |
| Review UI in a browser | not covered | no browser session driven |

## Findings
None unique to this module. Defects found while exercising the entry points are owned elsewhere: DI-001, DI-002 (data-integrity), ERR-001, ERR-002 (errorrecovery), CLI-001, CLI-003 (cli-package), TIME-001 (timekeeping).

Critical path: plan -> doctor -> capture -> approve -> diff completes end to end on the fixtures. Auth: N/A. Payments: N/A.

Smallest next action: fix DI-001, since it silently disables a CI gate.
