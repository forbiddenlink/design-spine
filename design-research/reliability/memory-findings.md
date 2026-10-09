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

## Follow-up: avoid redundant decoding — October 9, 2026

The next isolated probe attributes most sampled work to PNG decoding and encoding rather than pixel comparison. The exploratory three-image run is in comparison-performance.json and its reproducer is comparison-performance.ts. Default encoding produced 1,236,729 bytes; forcing no PNG filter produced 8,914,417 bytes for identical decoded pixels. That roughly 7.2× evidence growth was rejected. The probes ran in fixed order and visibly warmed up, so their elapsed times cannot establish an encoding speed ratio. An initial 24-image probe was interrupted before producing a complete row and is excluded.

The chosen change avoids decoding the current PNG a second time only when the baseline and current encoded buffers compare equal. The baseline still undergoes full PNG decoding/validation, and existing pixelmatch plus PNG encoding still generates the difference evidence. Different encoded bytes use the original two-decode path. No cache, threshold, filename, stored format or compression setting changes.

A deterministic regression failed before the change (two PNG decodes instead of one), then passed. Safeguards cover equal pixels with different PNG encoding and identical invalid files. Existing tests cover changed pixels, missing evidence, size mismatch, symlink containment, worker batching and queue recovery. The first 24-image differential worker probe verifies 48 exact SHA-256 evidence matches and unchanged statuses/ratios against the original two-decode pipeline; see comparison-decode-24.json and verify-comparison-decode.ts. Reference timing is measured on the main thread and the implementation in its worker, so these observations are not an isolated speed ratio.

This removes one decoded image allocation per byte-identical pair. It does not establish lower idle RSS, improved high-entropy performance, leak freedom or multi-hour stability. Compression/filter tradeoffs and general comparison latency remain separate concerns.

Full-workload follow-through: one local HTTP `/api/comparison` request completed all 240 pairs in 54,385 ms, and all 480 served baseline/difference images matched the reference SHA-256 hashes, with matching statuses and ratios. Raw result: comparison-decode-240-server.json. The reference pass took 153,898 ms on the main thread with per-image collection and hash checks; it is not a matched worker timing control. The first sandbox-bound attempt completed its reference pass but failed to bind port 0 (`EADDRINUSE`); the successful rerun used local-listener access. No connection reset occurred in that successful request. One run does not establish timeout reliability or multi-hour stability. Final observed process RSS includes retained server evidence and the verification harness, and is neither idle RSS nor sampled peak memory.

Final checks: 79 tests in 12 files, no-emit TypeScript and compiled CLI build pass. Lint exits 0 with only the previously recorded capture.ts:247 warning. Diff whitespace check passes. No UI changes or new browser/Lighthouse claim; no merge, push, deploy or original fixture modification.
