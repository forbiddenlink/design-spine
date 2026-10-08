# Accessibility, controlled profiling and repeated-session validation

Branch: design/upgrade. Existing example data and original baselines remain excluded.

1. Exercise actual VoiceOver in the owned Chrome fixture; inspect caption feedback without enabling AppleScript or changing security permissions. Record/restore the initial off state. If native tooling cannot expose spoken feedback, report that limit rather than claiming a manual audit.
2. Resolve the incomplete mobile route-index contrast assessment by bringing each link into view and calculating the rendered text/background contrast; test both themes and keyboard navigation. Preserve horizontally scrollable navigation.
3. Profile mixed-resolution comparisons using generated evidence, repeated measurements, identical samples before/after and sequential execution. Optimize only a measured bottleneck; preserve native PNGs, thresholds, comparison statuses, canonical path checks and snapshot isolation.
4. Exercise repeated comparisons, snapshot expiry, slow/interrupted saves and recovery with owned fixtures. Distinguish repeated-cycle stress from an actual multi-hour soak.
5. Verify appropriate regressions/build/type/lint, update progress/report and commit the phase. No deploy/merge or schema/route changes.
