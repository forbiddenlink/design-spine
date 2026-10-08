# Findings and fixes

All reproductions use owned/generated files. Severity reflects impact on the local operator, not an assertion of production exploitation.

| Severity | Reproduction; expected → actual before fix | Cause | Fix / evidence |
|---|---|---|---|
| High | `diff --threshold NaN` against different PNGs; reject option → exits 0, gate passes | Unvalidated Number conversion; comparisons against NaN are false | Bounded finite numeric validation. tests/cli.test.ts reproduced failures first, then passed |
| High | Run containing `/a/b` and `/a-b` in the same state; distinct evidence → same tile ID/file | Sanitized route naming collapses distinct paths | Reject duplicate output names before browser/files are created. tests/capture.test.ts reproduced 2 failures first; naming migration deferred |
| High | Damaged review.json followed by save; preserve bytes → parsed as missing file and replaced | Generic readJson returns null for absent and corrupt files | Distinguish absence from corruption; reject malformed files/entries and refuse POST with 503. tests/runs.test.ts and server-checks.json |
| Medium | Recorded screenshot is a symlink to a generated PNG outside run; 404 → 200 | Lexical path containment did not check canonical target | Recorded-file lookup plus realpath containment. server-before-checks.json / server-checks.json |
| Medium | `/img/%ZZ`; client error → server URIError/500 | Uncaught percent-decoding failure | Respond 400; before/after server evidence |
| Medium | Edit note then click Inspect; viewer opens → first click misses because save status shifts cards | Empty status removed from layout and inserted on blur, between pointer down/up | Reserve status space and explain saves before editing. Pointer-click regression exercised at both widths/themes with a generated save outage; viewer-checks.json |
| Medium | Open baseline, create five newer snapshots, switch back; recover without losing draft → stale PNG 404 and full reload suggested | Four-snapshot retention intentionally expires old evidence, no in-page recovery | Refresh evidence obtains new URLs while drafts remain. viewer-checks.json reproduces expiry and checks recovery |
| Low | Invalid concurrency/critique limit silently defaults, truncates or skips work | Unvalidated numeric options | Positive integer validation before any capture/provider call; tests/cli.test.ts |

No persisted schema, URL/route structure, dependency or baseline approval policy changed. Screenshot endpoint now serves only recorded captures whose canonical path remains inside the run.

Additional low-severity planning fix: `plan --app <regular-file>` previously accepted the file and wrote an empty route manifest. Explicit app paths now require a directory. tests/routes.test.ts reproduced the failure before the fix.

Native skip-link, disclosure Enter, PNG download and backdrop behavior were verified as existing working features; they were not changed. The unavailable-download state is now tied to screenshot availability and restored after evidence refresh.
