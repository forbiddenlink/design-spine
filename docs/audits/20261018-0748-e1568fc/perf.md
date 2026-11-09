# perf audit (e1568fc)

Applies partly: the repo serves a web UI only as a loopback review page (src/ui/index.html, single static file, 70 KB, served by Bun.serve at src/lib/server.ts:32-36). No Next/Vite, no images/fonts/third-party scripts, no Web Vitals field data. LCP/CLS/INP: NOT COVERED (no browser trace taken; Lighthouse is not meaningful for a 127.0.0.1 tool page). This audit measures the CLI hot paths instead. Machine was shared with three other audit sessions, so wall times are noisy upper bounds.

## Measurements (all synthetic fixtures under /private/tmp/claude-501/ds/, tool = `/usr/bin/time -l` or `performance.now`)

| Case | n | p50 | p95 | max | Notes |
|---|---|---|---|---|---|
| `capture` trivial page, 2 tiles, concurrency 2 | 5 | 2.08 s | 2.20 s | 2.20 s | wall; fixed sleeps per tile (capture.ts:350 400 ms, :233 300 ms, scroll 150 ms per step :229) set the floor |
| `diff`, 12 tiles of 1280x8000 (10.2 Mpx each), half the pixels changed | 5 | 44.24 s | 48.16 s | 48.16 s | min 39.97 s; peak RSS 787 to 1018 MiB |
| One tile decode / pixelmatch / region scan / PNG encode (same fixture) | 3 | 295 / 760 / 46 / 732 ms | | 341 / 927 / 83 / 1012 ms | decode both images; encode of diff image is ~40% of per-tile time |
| Review server `/img/<file>`, 1000 tiny tiles | 100 | 2.77 ms | 7.49 ms | 13.52 ms | sequential |
| Review server `/api/run` with comparison, 1000 tiny tiles | 1 | 1887 ms | | | response 993,387 bytes; `/api/comparison` 1203 ms (n=1); server RSS 174 MiB |
| Review server `/api/run` 2 tiles (compiled binary) | 5 | 6 ms | | 52 ms (cold) | |

Worst case here is deliberately pathological (high-frequency checker image, 50% of pixels differ). Real pages differ far less, so treat 44 s as a ceiling for that image size, not a typical figure.

## Biggest risks
- LCP/CLS/INP: NOT COVERED for the review page.
- Biggest CLI cost: PNG encode of the diff image for every compared tile (cli.ts:326 `if (r.diff) writeFileSync(... PNG.sync.write(r.diff))`), including tiles that are unchanged, plus the region scan in `compareImages` (diff.ts:48-68) whose result the CLI `diff` never reads.

## Findings

### PERF-001 | Low | Medium | src/cli.ts:326; src/lib/diff.ts:48-68
Problem: `spine diff` encodes and writes a diff PNG for every tile and computes changed-region boxes that only the review server uses.
Evidence: profile above (encode 530 to 1012 ms of ~2 s per large tile); fixture t2 (both tiles `ok`, 0.00000 ratio) still produced `diff/a__...png` and `diff/b__...png` (142 B each); fixture t6 wrote 12 diff PNGs, 2.5 MB; region result unused in cli.ts:316-330.
Impact: slower CI diff on tall full-page captures and extra disk per run. Magnitude measured on a synthetic worst case only.
Fix: write the diff PNG only when `r.exceeds` (or under `--write-diffs`), and skip the region scan in the CLI path (a flag on `compareImages`).
Verification: rerun `diff` on t6; expect wall time to fall by the encode share for unchanged tiles.

### PERF-002 | Low | Low | src/lib/server.ts:89, 115, 127, 147
Problem (hypothesis): `/img/*` and `/api/review` re-read and re-parse run.json on every request (`loadRun(runDir)` called two to three times per POST). At 1000 tiles /img stayed under 14 ms (measured), so this is not an observed bottleneck.
Fix: cache the parsed run per runDir keyed on mtime if it ever shows up.

## Bundle and caching
No client bundle: single HTML file with inline script, no external requests (report.ts CSP `default-src 'none'` is for the offline report). Hashed-asset Cache-Control: N/A (the page is served without cache headers, src/lib/server.ts:33-35, appropriate for a local tool).
CI size gate: not present, and no client bundle to budget. The compiled binary is 71 MB (`ls -la design-research/build/spine`), which is Bun runtime plus Playwright; no budget needed.

## Not covered
Memory-soak behavior over hours (design-research/implementation-verification/memory-soak.json exists, untracked, not re-run: high-load). Real-device and real-app capture timings. `--concurrency` scaling.
