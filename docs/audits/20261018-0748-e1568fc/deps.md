# deps audit (e1568fc). Versions read from pnpm-lock.yaml / `pnpm ls`.
Installed: @axe-core/playwright 4.13.0, commander 15.0.0, pixelmatch 7.2.0, playwright 1.63.0, pngjs 7.0.0; dev: biome 2.5.15, @types/bun 1.4.2, @types/pixelmatch 7.1.0, @types/pngjs 6.0.5, typescript 7.0.2, vitest 5.0.3.
CVE: osv 0 (precheck.md). Stack-specific items (Supabase, Stripe, Next) N/A: not in package.json.

## DEP-001 | Low | High | package.json:24, pnpm-lock.yaml:397
Problem: @types/pixelmatch is a deprecated stub ("pixelmatch provides its own type definitions"; `npm view` confirms).
Fix: remove it; `tsc --noEmit` must stay clean. pixelmatch@8.0.0 declares `types: index.d.ts` (npm view).
Verification: tsc exit 0 after removal.

## DEP-002 | Low | High | package.json:15-19
Problem: behind latest: pixelmatch 7.2.0 -> 8.0.0 (major, used only in src/lib/diff.ts:1), playwright 1.63.0 -> 1.64.1, @axe-core/playwright 4.13.0 -> 4.14.0 (precheck).
Fix: bump playwright and axe together, run capture/browser tests; pixelmatch 8 needs a diff.test.ts pass.

## DEP-003 | Low | Medium | package.json:16
Problem: @axe-core/playwright is MPL-2.0 (`pnpm licenses list`); `build` script bundles deps into a compiled binary. File-level copyleft only; matters if the binary is distributed. Distribution intent: UNKNOWN.
Fix: confirm intent; if shipping, include MPL notice.

Not covered: abandonment/last-publish checks per package (no registry timing run); bundle size; pngjs 7.0.0 age is a hypothesis only. License rows past the first 40 not read.
No bloat found: 5 runtime deps, each imported in src (src/lib/diff.ts, capture.ts, cli.ts).
