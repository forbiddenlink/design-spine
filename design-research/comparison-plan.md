# Comparison phase — design and contract

User authorized continuing development after follow-up research. Chosen scope: bring existing local baseline evidence into review, provide changed-first triage, and show existing provenance. Preserve routes, review decisions, notes, explicit CLI baseline promotion, and stored data shapes. No hosted integration or new dependency.

Alternatives considered: expose cached CLI diff files (can become stale after baseline changes); recompute differences read-only when review loads (chosen); introduce persistent comparison history (requires approval and is unnecessary for this phase).

## Read-only API additions

GET /api/run retains run/review/critique and adds comparison: comparedAt, threshold, tiles keyed by existing tile ID. Entry status is new, changed, unchanged, size-changed, no-capture, or unavailable; optional ratio, baselineUrl, diffUrl, baselineRun, approvedAt fields appear only when evidence exists. Unchanged means within the configured threshold, not necessarily pixel-identical. The UI labels this Within threshold.

Comparisons are computed from current PNG files. Existing diff.json supplies a valid finite threshold from 0 to 1; otherwise use the CLI default 0.002. Old comparison rows are not trusted. Baseline provenance comes from the existing baseline manifest. Invalid PNGs fail per tile rather than failing the whole review.

GET /comparison/baseline/{snapshot}/{encodedTileId} and /comparison/diff/{snapshot}/{encodedTileId} return only generated in-memory evidence from an API snapshot. Unknown or expired evidence returns 404. Responses are PNG with no-store. Snapshot identifiers prevent mixing baseline images from another load. The server retains four recent evidence snapshots to bound memory; older tabs may need a reload. No arbitrary paths are read through these routes. File reads reject traversal and symlinks escaping the current/baseline directories.

The baseline directory is the baselines sibling of the standard runs directory, resolved from the real run path so latest symlinks work. Arbitrary run folders without that layout have no corresponding baseline evidence.

## Review interaction

Cards label comparison status separately from capture diagnostics and approval. Only changed includes new captures, changed pixels above threshold, and changed dimensions. Existing route, theme, viewport, diagnostic, and review filters remain available. Export includes comparison evidence with existing run/review/critique.

Viewer offers Current, Baseline, Difference, and Compare both. Compare both places baseline/current side by side on desktop and stacks them on mobile. Captions remain explicit. Unavailable modes are disabled. Size mismatch allows baseline/current inspection but disables pixel difference; images are never resized for the comparison calculation. Actual size remains available for individual images; it is disabled in the combined view to prevent overlapping panes. Native select keyboard behavior is preserved.

## Verification criteria

Prove all six statuses with generated fixtures; verify PNG serving and unknown-path rejection; verify baseline provenance, changed-only filtering, missing-mode behavior, and successful image decoding in desktop/mobile browsers. Check existing save/filter/keyboard journeys, accessibility in light/dark comparison modes, tests, typecheck, lint, builds, and Lighthouse with and without baseline computation.

Remaining limitations: synchronous comparison on review load has not been measured at hundreds of captures; only four evidence snapshots are retained; a manual screen-reader audit is outstanding. Persistent history and capture-environment metadata remain approval items.
