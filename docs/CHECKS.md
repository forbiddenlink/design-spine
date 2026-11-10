# Checks reference

Every capture runs these checks. A check never approves or rejects a screen. It marks the screen so a person looks at it first.

In the review app a check shows up in one of two ways:

- **Flag**: counted under "Flagged", listed as a badge on the card, shown in the coverage matrix as "N flags", and matched by "Only flagged".
- **Warning**: listed as a badge and matched by "Only capture warnings". Not counted as flagged.

Source: `src/lib/capture.ts`, `src/lib/blank.ts` and `flags()` in `src/ui/review.js`.

## Flags

| Check | What triggers it | How it is detected |
|---|---|---|
| Horizontal overflow | The page is wider than the viewport | `documentElement.scrollWidth > clientWidth` after the page settles. The card's screenshot gets an accent edge on the right. |
| Blank region | A visible box at least 120 x 80 px with no text and no media, form control or button inside, whose pixels are nearly uniform | Candidate boxes come from the DOM, outermost only, fixed elements skipped. Each is measured on the screenshot, inset 6 px to skip borders. Luminance variance of 25 or less (0 to 255 scale) counts as blank. The boxes are drawn on the card and in the inspector. |
| Broken image | An `<img>` finished loading with a natural width of 0 | Checked on `document.images`. URLs are stored without query strings. |
| Console error | The page logged at error level | Up to 5 distinct messages are kept per screen. |
| Page error | An uncaught exception in the page | Up to 5 distinct messages are kept per screen. |
| Failed request | A request failed or returned an error status | A response you mock for a state is not reported. A 429 that succeeds on the one retry is not reported. |
| HTTP status | The document returned 400 or higher, or no response | The screen is still captured, because a 404 or 500 page can be a designed state. |
| Redirect | The route ended on a different URL | Typical cause: an auth route bouncing to login because `storageState` is missing. |
| Capture failed | A readiness selector, step or screenshot timed out | The error is stored with the stage that failed. `spine capture` exits 1 and the run stays reviewable. |
| Accessibility findings | axe reported violations | Optional. Set `capture.accessibility` in the manifest. Runs the WCAG 2.0 and 2.1 A and AA rule tags with a 15 second limit. A scan that fails or times out is flagged as unavailable. |
| Unstable capture | Repeat screenshots never matched | Optional. Set `capture.stabilityAttempts`. Consecutive screenshots are compared 150 ms apart until two are identical. |

## Warnings

| Check | What triggers it | How it is detected |
|---|---|---|
| Covering overlay | A fixed or sticky layer covers 15% or more of the first viewport | Slim top headers (120 px or shorter, anchored at the top) are skipped. Up to 3 outermost layers are reported with a selector and opening text. Dismiss the layer with `initScripts` or a `steps` click. |
| Clipped text | Text is wider than its `overflow: hidden` container by more than 4 px | Intentional clipping is skipped: screen-reader-only boxes, `text-overflow: ellipsis`, `.truncate` and line-clamp classes. Up to 10 are kept per screen. |
| Assets did not settle | Fonts or images were still loading after 3 seconds | The capture continues with the content that was available. |

## Limits

- Blank-region detection is a heuristic. A flat hero panel with no text can be flagged, and a skeleton with a subtle shimmer can pass. Treat a flag as "look here".
- Overflow is measured on the document. A scroll container that overflows inside a fixed-width page is not reported.
- Checks run in Chromium only.
- The stability check is a bounded sample. It cannot prove a page never changes.
