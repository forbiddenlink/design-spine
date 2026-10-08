# Decisions

The next product improvement is connecting existing diagnostic evidence to the screenshot being reviewed. Blank-region boxes already contain document coordinates, so highlights can be accurate without a metadata migration. Native PNG dimensions define an SVG coordinate system; fit and actual-size modes preserve alignment. Coordinates from a current capture must never be painted on its baseline or difference image.

The audit prioritizes silent false passes and loss/escape of existing evidence over additional product scope. Numeric validation, preflight filename collision detection, corrupt-review preservation, screenshot path containment and in-page snapshot refresh address reproduced failures. They preserve the local workflow and explicit baseline approval.

Verification uses generated fixtures and a fake Claude executable. It demonstrates command wiring and provider result/failure handling without external requests, credentials or paid inference. Browser tests distinguish intercepted failure simulation from real persistence checks. No claim of universal correctness or physical-device/screen-reader coverage is justified.

Commit scope: src/cli.ts, capture/runs/server modules, screenshot viewer, targeted regression tests, docs/USAGE.md, functional-review evidence and design-research progress. Exclude existing examples/testimoniq/.design-spine.
