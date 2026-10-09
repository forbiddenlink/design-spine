# Field validation reasoning

Actual project selection was grounded in a fresh browser load and the sanitized GitHub remote for Liz-owned Create Surveys. The stale existing Chrome document showed CryptoViz while the same local address served Create Surveys to new contexts; no CryptoViz workflow claim is made. Public routes only, no logins/submissions, new contexts and isolated baselines.

The first 240-pair scale run exposed high process memory but contained an incorrect all-changed expectation and a non-immediate memory stop. Preserve it as exploratory evidence. The corrected immediate-cutoff run reproduces memory above 2.5GiB before any snapshot is returned, with less than 6MB of compressed inputs. Periodic synchronous collection alone still crosses the limit. Yielding the worker between groups plus collection completes two comparisons with exact repeated hashes below the ceiling. This isolates continuous temporary-buffer lifetime as the practical cause; allocator internals and exact allocation peaks are not established.

The CLI uses a similar synchronous decode/compare/encode loop. Its separate child-process reproduction crosses the same ceiling. Apply bounded yielding/collection there without altering thresholds, pixels, file formats, paths, baseline promotion, or verdict semantics. Validate hashes against server results.

The first long run and unit suite overlapped several CPU-heavy tests, causing timeouts. Those results are preserved as contended evidence and excluded from final verification. Sequential unit checks pass; the long run must complete separately. The existing tiny off-thread test assumed a timer always fired before a warmed worker completed trivial work. Give it a small non-trivial workload to test responsiveness without depending on worker startup.

VoiceOver launch and shortcut did not activate it; the targeted OS preference is off. Native keyboard evidence is separate and does not replace actual screen-reader testing. No permission was enabled.
