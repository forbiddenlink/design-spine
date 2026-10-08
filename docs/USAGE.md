# Design Spine usage

Run from the root of the repo you are gating. State lives in `.design-spine/`.
Invoke as `bun /Volumes/LizsDisk/design-spine/src/cli.ts <cmd>` or link the `spine` bin.

## Flow

```bash
spine plan                                  # draft design-spine.json from app/ or src/app/
# edit the manifest: fill dynamic params, seed empty/loading/error states, drop todo:true
spine capture --base http://localhost:3000  # route x state x viewport x theme -> PNGs + run.json
spine critique --only-flagged --limit 8     # optional vision pass through the claude CLI
spine review                                # http://localhost:4747 contact sheet
spine approve                               # approved tiles -> .design-spine/baselines/
spine diff --threshold 0.002                # CI gate, exit 1 on change
spine lint --dir src                        # arbitrary Tailwind value ratchet, exit 1 on increase
spine status                                # writes .design-spine/status.json
```

## Commands

| Command | Notes |
|---|---|
| `plan [--app dir] [--base url] [--out file] [--force]` | Route groups drop out of URLs. Dynamic routes get `params` placeholders and a `todo` ideal. |
| `capture --base url [--manifest f] [--routes /a,/b] [--concurrency 3]` | Skips `todo` states. Reduced motion on. Scrolls in viewport steps so lazy content renders. Updates `.design-spine/latest`. |
| `review [--run latest] [--port 4747]` | Keys: `j`/`k` move, `a` approve, `r` reject, `Enter` zoom. Writes `review.json`. |
| `critique [--run] [--only-flagged] [--limit N] [--model sonnet] [--claude-bin claude]` | Claude models only. 2 in parallel. Writes `critique.json`. `SPINE_CLAUDE_BIN` also sets the binary. |
| `approve [--run]` | Copies approved tiles to baselines, writes `baselines/manifest.json`. |
| `diff [--run] [--threshold 0.002]` | Ratio of changed pixels. A size mismatch counts as changed. Tiles without a baseline report `new`. |
| `lint [--dir src] [--update] [--force]` | `--update` refuses to raise the baseline without `--force`. |
| `status [--dir src]` | `{ lastRun, tiles, flagged, reviewed, approved, rejected, lintCount, lintBaseline, baselines }`. |

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
        { "name": "ideal", "storageState": "design-research/populated.json" },
        { "name": "empty", "storageState": "design-research/empty.json" },
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

The CLI rejects non-finite or out-of-range numeric options: threshold must be 0–1; concurrency and critique limit must be positive integers; port must be an integer from 0–65535 (0 selects an available port). Capture also rejects route/state combinations that produce the same filename before starting the browser. Use distinct state names for colliding combinations; existing filename and baseline formats remain unchanged.

An absent review file starts an empty review. A damaged review file does not: loading/saving stops so existing bytes are preserved. Repair the file from a trusted copy before retrying; Design Spine does not automatically replace damaged reviews.
