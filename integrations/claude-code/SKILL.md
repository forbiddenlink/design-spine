---
name: design-spine
description: Use after changing UI in a Next.js app that has design-spine.json, or when asked to check screens, states, dark mode, mobile layout, or visual regressions. Captures every affected route x state x width x theme with Design Spine, reads the automatic findings, looks at flagged screenshots, and hands the contact sheet to the human for approval. Never approves on the human's behalf.
---

# Design Spine check

Run this after a UI change, before saying the change is done.

1. Confirm the app is running and note its URL. If `design-spine.json` is missing, run `spine plan` and show the user the drafted routes.
2. Capture only what the change touched:
   ```bash
   spine capture --routes /changed,/routes
   ```
   Exit 1 means at least one tile failed to capture. Read the error before retrying.
3. Read the findings from the run record:
   ```bash
   jq -r '.tiles[] | select(.error or .overflowX or (.consoleErrors|length>0) or (.pageErrors|length>0) or .blankRegions.count>0 or (.brokenImages|length>0) or (.warnings|length>0)) | .id' .design-spine/latest/run.json
   ```
4. Open every flagged PNG in `.design-spine/latest/` and look at it. A finding is a hypothesis; confirm it by eye before fixing anything.
5. Fix what is real, recapture the same routes, and repeat until the flagged list holds only findings you can explain.
6. Optional second opinion: `spine critique --only-flagged --limit 8`.
7. Tell the user to run `spine review` and approve or reject the tiles. Do not run `spine approve`, edit `review.json`, or raise a diff threshold to make a gate pass. Approval is the human's record.

## Gotchas

- `capture` skips states marked `todo`. Run `spine doctor` to see what is still not capturable, and say so in your report instead of calling coverage complete.
- A fixed-overlay warning usually means a cookie banner. Dismiss it with an `initScripts` localStorage entry or a `steps` click in the manifest, not by hiding it in CSS.
