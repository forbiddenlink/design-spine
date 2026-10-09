# Reliability and accessibility follow-through — October 9, 2026

Work on design/upgrade; no main, deployment, deletions, services/keys, routes or stored-format changes. Preserve earlier evidence and original example data.

1. Reproduce idle memory with isolated owned captures. Measure RSS, live JS/ArrayBuffer heap and native allocator statistics. Ranked hypotheses after reproduction: retained comparison references; worker-owned native allocator pages; main-process HTTP/evidence cache. Compare one variable per experiment. Implement only a supported fix, preserving hashes, thresholds and responsive saves. Regression test at the actual seam and repeat the original workload.
2. Exercise the full review workflow in installed Chromium, Firefox and WebKit, desktop/mobile widths and both themes. Fix demonstrated compatibility failures; retain screenshots and blocked engines explicitly. Emulation is not a physical device or Safari application test.
3. Verify VoiceOver availability without changing security permissions. If unavailable, document the block; prepare a runnable manual screen-reader checklist. Continue independent work.
4. Verify standalone packaging from outside the checkout with isolated fixtures; fix demonstrated local asset/dependency resolution if safely possible. No release/publish.
5. Prepare a moderated real-user study with synthetic tasks, measurable success criteria and observation template. Do not claim real-user results without participants or send recruitment messages.
6. Full tests/typecheck/lint/build, independent code review for changes, final report/progress checkpoint and commits. Stop without merge.
