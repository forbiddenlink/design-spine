# Design Spine usage

Run from the root of the repo you are gating. State lives in `.design-spine/`.
Invoke as `bun <path-to-design-spine>/src/cli.ts <cmd>`, or run `pnpm link --global` in the design-spine checkout to get the `spine` bin. The CLI runs on Bun 1.3+. The npm package bundles Bun 1.3.13 and prefers a qualifying `bun` on your PATH, so you install Bun yourself only when running from a checkout.

## Flow

```bash
spine plan                                  # draft design-spine.json from app/ or src/app/
# edit the manifest: fill dynamic params, seed empty/loading/error states, drop todo:true
spine doctor                                # validate configuration and unfinished coverage
spine capture --base http://localhost:3000  # route x state x viewport x theme -> PNGs + run.json
spine critique --only-flagged --limit 8     # optional vision pass through the claude CLI
spine review                                # http://localhost:4747 contact sheet
spine approve                               # approved tiles -> .design-spine/baselines/
spine diff --threshold 0.002                # compatible pixel-only check
spine diff --require-baselines              # fail on new screens, no fresh approval required
spine diff --strict                         # complete, approved, compatible evidence gate
spine diff --summary summary.md             # also append a Markdown summary (used for the CI job summary)
spine report --out review.html              # portable offline evidence and saved decisions
spine lint --dir src                        # arbitrary Tailwind value ratchet, exit 1 on increase
spine status                                # writes .design-spine/status.json
```

## Commands

| Command | Notes |
|---|---|
| `plan [--app dir] [--base url] [--out file] [--force]` | Route groups drop out of URLs. Dynamic routes get `params` placeholders and a `todo` ideal. New manifests start with `capture.animations: "disabled"` and `capture.stabilityAttempts: 3` so motion and late-settling pages do not show up as false changes; existing manifests are unchanged. Routes whose path contains `#`, `?` or a backslash cannot be written into a manifest, so `plan` skips them and prints a warning naming each one. Symlinked directories are not followed. |
| `doctor [--manifest f]` | Offline validation, session-file existence and coverage inventory. Exit 1 for unfinished/no capturable states, 2 for invalid configuration. |
| `report [--run latest] [--out review.html]` | Self-contained HTML with original screenshots, saved notes, coverage and capture findings. Refuses to overwrite an existing output file. |
| `capture --base url [--manifest f] [--routes /a,/b] [--concurrency 3] [--docker]` | `--docker` captures inside a pinned Linux x64 Playwright image; see Matching CI baselines. Skips `todo` states. Reduced motion on. Scrolls in viewport steps so lazy content renders. Updates `.design-spine/latest`. Exits 1 when any tile fails to capture; the run stays reviewable. |
| `review [--run latest] [--port 4747]` | Keys: `j`/`k` move, `a` approve, `r` reject, `Enter` zoom. Writes `review.json`. |
| `critique [--run] [--only-flagged] [--limit N] [--model sonnet] [--claude-bin claude] [--timeout 300]` | Claude models only. 2 in parallel. Writes `critique.json`. `SPINE_CLAUDE_BIN` also sets the binary. A tile that runs past `--timeout` seconds is killed and recorded as `error`, and `critique` exits 1 when any critiqued tile ends in `error`. Claude gets only the `Read` tool and an allowlisted environment (`PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `TMPDIR`, `TERM`, `LANG`, and `LC_*`, `XDG_*`, `ANTHROPIC_*`, `CLAUDE_*`). Claude runs from a temp directory with only your user settings and no MCP servers, so the target repo's hooks and MCP config never load. Route query strings are left out of the prompt. |
| `approve [--run] [--dry-run]` | Copies approved tiles to baselines atomically and records each baseline's image hash in `baselines/manifest.json`. `--dry-run` lists additions and replacements without writing. Exits 2 without writing if that manifest exists but does not parse or does not have a `tiles` object. |
| `diff [--run] [--threshold 0.002] [--strict] [--summary <file>]` | `--summary` appends a GitHub-flavoured Markdown summary to the file: pass or fail, counts per result, a table of the tiles that are not `ok` (first 50, then "and N more"), and any strict gate reasons. Tile ids and reasons are escaped. Ratio of changed pixels. A size mismatch counts as changed. Tiles without a baseline report `new`. Diff images are written only for tiles with changed pixels. In strict mode a baseline whose bytes no longer match its recorded hash reports `modified-baseline`. A baseline or capture PNG that cannot be decoded reports `unreadable` for that tile, counts as failed, and the remaining tiles are still compared. A baseline manifest with the wrong shape exits 2. |
| `lint [--dir src] [--update] [--force] [--exceptions]` | `--update` refuses to raise the baseline without `--force`. A corrupt `lint-baseline.json` exits 2 instead of passing. |
| `status [--dir src]` | `{ lastRun, tiles, flagged, reviewed, approved, rejected, lintCount, lintBaseline, baselines }`. |

## Matching CI baselines

Fonts and rendering differ between machines, so a baseline captured on a Mac fails `spine diff` on CI, and `--strict` also rejects it because the recorded platform differs. A plain Linux runner is not enough either: a docker baseline compared with a native `ubuntu-latest` capture differed by 0.3% to 1.6% of pixels on every tile of the demo site (fonts installed on the runner differ from the image). Capture with `--docker` on both sides. Locally:

```bash
spine capture --docker --base http://localhost:3000
spine review
spine approve
```

The first run builds `design-spine-capture:<playwright version>-bun<bun version>` from `mcr.microsoft.com/playwright:v<version>-noble` plus Bun (about 2.6 GB, cached by tag after that). Every build and run uses `--platform linux/amd64`, so runs record `provenance.platform` as `linux/x64` everywhere. The GitHub Action captures with `--docker` by default (input `docker`). Verified 2026-10-18: demo-site baselines captured with `--docker` on an Apple silicon Mac matched a `--docker` capture on `ubuntu-latest` with zero changed pixels on all 12 tiles. On Apple silicon the container runs under emulation and is slower.

- The project root is mounted at `/work`. If the CLI lives outside the root, its package directory is mounted read-only at `/spine`.
- `localhost`, `127.0.0.1` and `[::1]` in `--base` (or the manifest `baseUrl`) are rewritten to `host.docker.internal` for the container. The run still records the URL you passed.
- On Linux hosts (CI runners) the container shares the host network, so `localhost` works as is. On macOS the app must accept connections from Docker Desktop or OrbStack, which it does when it listens on all interfaces (the Next.js default).
- Exits 2 when `docker` is not on PATH or the daemon is not running. The manifest must sit inside the project root.

## Automatic checks per tile (`run.json`)

`status`, `consoleErrors`, `pageErrors`, `overflowX`, `blankRegions` (visible box of at least 120x80 with no
text or media and near-zero pixel variance), `brokenImages`, `textClipped` (warning only, not flagged).

## Example manifest

```json
{
  "baseUrl": "http://localhost:3000",
  "viewports": [390, 1280],
  "themes": { "light": "light", "dark": "dark", "method": "localStorage", "key": "theme" },
  "initScripts": [{ "localStorage": { "cookie-consent": "rejected" } }],
  "routes": [
    { "path": "/", "states": [{ "name": "ideal" }] },
    {
      "path": "/dashboard",
      "states": [
        { "name": "ideal", "storageState": "auth/populated.json" },
        { "name": "empty", "storageState": "auth/empty.json" },
        { "name": "error", "query": "?forceError=1" },
        { "name": "loading", "todo": true, "setup": "stall the data request" }
      ]
    },
    { "path": "/blog/[slug]", "params": { "slug": "hello-world" }, "states": [{ "name": "ideal" }] }
  ]
}
```

Theme `method`: `localStorage` sets `key` to the `light`/`dark` value before load, `class` adds that class to
`<html>`, `media` only emulates `prefers-color-scheme`.

## Review diagnostics and recovery

In the screenshot viewer, **Show blank regions** outlines the possible blank areas recorded by capture. **Jump to** scrolls to a chosen area, including one far down a long page. These outlines apply to the current screenshot (including Compare both); they are disabled for baseline/difference evidence. Other diagnostics remain in the capture details because their coordinates were not recorded.

If a comparison image expires during a long review, **Refresh evidence** requests a new comparison without reloading the page or clearing note drafts. A missing current capture still needs its capture file restored.

Usage errors (unknown options, missing arguments) exit 2. The CLI rejects non-finite or out-of-range numeric options: threshold must be 0–1; concurrency must be an integer from 1–32; critique limit must be a positive integer; port must be an integer from 0–65535 (0 selects an available port). Capture also rejects route/state combinations that produce the same filename before starting the browser. Use distinct state names for colliding combinations; existing filename and baseline formats remain unchanged. Non-ASCII characters in a route become `u` plus the hex code point (`/关于` is `u5173u4e8e`), so such routes no longer collapse into `home`; ASCII routes keep their current filenames. Filenames that differ only by case count as the same filename.

An absent review file starts an empty review. A damaged review file does not: loading/saving stops so existing bytes are preserved. Repair the file from a trusted copy before retrying; Design Spine does not automatically replace damaged reviews.

## Start and verify locally

Development is pinned to Node 22.23.1 and pnpm 12.6.0; the CLI runs with Bun (verified with 1.3.13). Run `pnpm install --frozen-lockfile`, then `pnpm exec playwright install chromium`. Install browsers separately from the compiled CLI. `pnpm build` writes `dist/spine`; the `dist` directory is ignored. These commands were tested on macOS arm64; other platforms still need verification.

For a first project, run `plan`, fill the route parameters, then run `doctor`. `setup` is guidance for a human: it is never executed. Remove `todo` only when an executable state is ready. Use `exclude` with a written reason for a deliberate omission. A route filter is a partial capture, not an intentional manifest exclusion.

The review server binds to loopback and accepts only localhost/127.0.0.1 hosts. Run history covers sibling run directories. Switching runs is disabled while notes, requests or failed saves remain outstanding. A failed switch disables review controls until loading succeeds. Opening a screenshot adds a `tile` URL parameter; the `run` parameter identifies a selected historical run.


## Reproducible state recipes

Optional manifest fields are additive; existing manifests remain valid. Unknown fields and malformed values fail validation before capture.

```json
{
  "capture": {
    "animations": "disabled",
    "clock": "2026-10-10T12:00:00Z",
    "stabilityAttempts": 3,
    "timeoutMs": 5000,
    "accessibility": true
  },
  "routes": [{
    "path": "/dashboard",
    "states": [{
      "name": "error",
      "responses": [{ "url": "**/api/dashboard", "status": 503, "body": "Unavailable" }],
      "steps": [{ "action": "click", "selector": "button[data-open-details]" }],
      "ready": { "selector": "[role=alert]", "timeoutMs": 5000 },
      "masks": [{ "selector": "[data-live-clock]", "reason": "Live clock is reviewed separately" }]
    }]
  }]
}
```

This is an excerpt: retain the required `baseUrl`, `viewports` and `themes`. Supported steps are `click`, `hover`, `fill` (with `value`), `press` (with `key`) and `wait` for a visible selector. Each supports `timeoutMs` from 1 to 30,000; at most 50 steps are allowed. Responses are Playwright URL patterns fulfilled before navigation. Service workers are not intercepted by page routing; a fixture must actually reach the routed request. No arbitrary JavaScript is evaluated from configuration.

A fixed clock sets the page's Date value and must end in `Z` or a UTC offset, so every machine pins the same instant; timers continue running. Reduced motion is always requested. Disabling animations affects screenshot capture. Stability checks compare consecutive encoded screenshots, up to 2–10 attempts, 150 ms apart. They are a bounded sample, not proof that a page can never change. Dynamic content, including masked content, can still make stability fail.

Masks require a selector and reason and must match a visible element. Current and approved-baseline mask boxes are ignored for pixel comparison; their areas still count in the full-image ratio denominator. Original screenshots remain untouched and are available in inspection, download and reports. Changing the recipe or its masks requires a newly reviewed and explicitly promoted baseline for strict sign-off.

Capture records a version-2 coverage inventory, image hashes, per-tile recipe fingerprints, and commit/dirty status, browser, runtime, platform and capture policy. Session contents are not copied into this metadata or reports. Recipe fingerprints include configured session-file paths, not their file contents. Failed readiness, recipe and session initialization are recorded per tile, with a failure stage. Scrolling is bounded to 100 steps and 100,000 pixels; very long/infinite pages fail instead of growing indefinitely.

When `accessibility` is enabled, axe scans the rendered state for WCAG 2/2.1 A/AA tagged rules. Findings and scan errors appear in capture details and reports. Strict mode fails when that requested scan is missing, failed or contains violations. Automated testing is partial; it does not establish WCAG conformance. See [Playwright's accessibility testing guidance](https://playwright.dev/docs/accessibility-testing).

## Complete sign-off and evidence inspection

Use `spine diff --require-baselines` in CI to fail on missing baselines as well as changed or unreadable captures. Unchanged screens do not need a new review in that run. The GitHub Action exposes the same opt-in policy as `require-baselines: "true"`. This does not require full coverage or matching provenance; use `--strict` for those guarantees. When both flags are present, strict sign-off still applies. The recorded diff and job summary identify the selected policy.

Default `diff` retains its prior behavior: new tiles are reported without failing solely for missing baselines. `diff --strict` requires known full coverage, every non-excluded tile captured and human-approved, unchanged pixel results, verified original image hashes, matching capture recipes and compatible browser/runtime/platform/policy. Unfinished, failed, filtered, unstable, pending, rejected, missing-baseline, changed-size and incompatible evidence fail. Only explicit manifest exclusions with reasons are permitted. Legacy runs remain readable but cannot pass strict mode; recapture and review them. No command automatically changes review decisions.

On the first run, strict mode fails until screenshots have been reviewed and explicitly promoted with `spine approve`. The review UI's Approve button saves the review decision; the CLI command copies approved evidence into the baseline. Reviewing alone does not create baselines or make a missing-baseline strict check pass.

Use **Only changed**, **Only flagged** and **Only unreviewed** together to form review queues. Route navigation shows reviewed/total captured counts. Coverage is separate from review completion and exposes unfinished or excluded states.

Open the coverage summary to see a matrix of route/state rows and width/theme columns. Captured cells show their current decision; selecting one clears the review filters and opens that exact screenshot, including captures on another page. Failed, unfinished, excluded, filtered, not-yet-captured and missing evidence have explicit labels and cannot be approved through the matrix. Cells outside a row's planned combinations say **Not planned**. Coverage reasons and capture environment remain available below the matrix. Legacy runs still show coverage as unknown.

On narrow screens, **Filters** expands the secondary review controls and shows how many are active when collapsed. Search remains available above the screenshots. Expanding the window restores the full filter bar.

In inspection, **Changed area** jumps to regional differences even when the whole-image change ratio is below the threshold. Nearby changed rows are grouped; at most 100 vertical regions are returned. **Compare both** shares a scroll container; **Overlay** blends baseline and current with adjustable opacity. Overlay is unavailable when dimensions differ.

A note can have one saved location on the original image. Use **Locate note on screenshot**, or enter X/Y pixel coordinates inside the note details for keyboard access. A marker and **Go to note location** show its position. Saving checks the screenshot's actual hash and bounds; a stale location is rejected. The location stays attached to its image hash when the note or decision changes. Clearing it leaves the note intact.

**Export** downloads JSON. **Offline report** downloads static HTML with embedded originals, confirmed decisions, notes, coverage, provenance, masks and capture diagnostics. Export is disabled while drafts, failed saves or pending requests remain. Reports contain no remote resources or scripts; they are read-only and do not promote baselines. Reports refuse paths outside the run directory and cap original image bytes at 100 MiB. Comparison images and interactive overlays are available in the local workspace, not embedded into the offline report.

## Explained token exceptions

For a deliberate arbitrary-value exception, put a comment immediately before the affected source line:

```tsx
// spine-allow-next-line: Match the fixed dimensions of the external embed
const frameClass = 'h-[313px]'
```

JSX `{/* spine-allow-next-line: reason */}` comments also work. A blank reason has no effect. The exception covers only the next line. `spine lint --exceptions` lists exempt values and reasons so they remain reviewable; normal lint counts the remaining values. This is a lexical check, not a complete Tailwind or design-quality assessment.

## Verify the review interface

`pnpm test` includes a synthetic 64-capture workflow with mixed decisions, long routes, missing coverage, pagination, mobile filters and keyboard focus recovery. It also checks the website demo's comparisons, rejection notes, reset and accessibility. The demo never writes a review or promotes evidence.

`pnpm test:visual` compares the review grid, coverage matrix, inspector and website example with checked-in screenshots. Review screens cover 390, 630 and 1260 pixels in light and dark themes. It uses the same version-pinned Linux x64 Playwright/Bun image as Docker capture, with networking disabled, so local and CI rendering match. Docker must be running; the image is downloaded on first use. Test containers use `--rm` and create no persistent volumes. Website font requests are blocked deliberately, testing the local fallback layout without an external font dependency.

Missing baselines fail. Intentional visual changes require `pnpm test:visual:update`, inspection of the resulting files in `tests/visual-baselines/`, then a passing `pnpm test:visual` run. Never update baselines just to silence an unexpected failure. Failed comparisons write actual, expected and difference images to `.design-spine/visual-results/`; CI uploads that directory on failure.

The review HTML loads fixed local script/style assets from `src/ui/`. The extracted JavaScript and CSS are checked by `pnpm lint`. After changing asset handling, run `pnpm build` and `SPINE_REVIEW_BIN=dist/spine pnpm test tests/review-browser.test.ts tests/review-workflow-browser.test.ts` to check the compiled binary as well as source execution.
