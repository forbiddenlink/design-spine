# Memory diagnosis

Observed on Bun 1.3.13/macOS arm64 using the prior isolated 240-pair fixture: ten copies of each of 24 real anonymous public-page captures. This is not 240 unique pages, a photographic entropy stress test or a multi-hour soak.

Ranked hypotheses: (1) the serialized queue retains its completed result, (2) the idle callback retains its job closure, (3) worker/native allocation contributes to RSS high-water, (4) the HTTP snapshot cache legitimately keeps screenshot evidence. A one-tile real worker result with caller references released reproduced live-map retention under 20 event-loop turns and forced collections. Queue-completion-only change still retained it, including after worker idle. Separating the idle callback context and clearing the timer plus retaining void completion instead of evidence makes the identical regression pass. Worker batching, output buffers, thresholds and the four-snapshot HTTP cache remain intact.

| Probe | Before | After |
| --- | --- | --- |
| Released direct result, live external buffers after 17s idle | 86 MiB | 0 MiB |
| Direct result, RSS after idle | 53 MiB | 217 MiB |
| Server two retained snapshots, live external buffers after idle | 173 MiB | 173 MiB |
| Server RSS after idle | 351 MiB | 620 MiB |

These are separate process runs; concurrent browser/build work and allocator behavior prevent attributing RSS differences or elapsed times to the small reference fix. Do not claim lower overall RSS or faster comparisons. After replacing the direct job with an empty one, final RSS is ~44 MiB; that extra checkpoint is not an ordinary server operation. Successful server retry verified all 240 pairs unchanged at ratio zero twice; comparison times ~99.5/97.7 seconds. A previous retry hit a connection reset before its first comparison completed; retain memory-server-timeout.json. Long-running comparison latency and HTTP timeout margin remain concerns for a subsequent isolated performance phase.

Raw before/after: memory-direct-before.json / memory-direct.json and memory-server-before.json / memory-server.json. The reproduction scripts preserve each measurement’s scope. Bun’s native allocator committed counters underflow after worker shutdown in these profiles; use neither those counters nor RSS alone as proof of a live leak. Official API context: [Bun gc](https://bun.com/reference/bun/gc), [heapStats](https://bun.sh/reference/bun/jsc/heapStats), [worker lifecycle](https://bun.sh/docs/runtime/workers). Local runtime behavior was measured rather than inferred from current documentation versions.
