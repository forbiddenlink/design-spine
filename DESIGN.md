---
name: design-spine
updated: 2026-11-16
colors:
  shared:
    light: { ink: "#141414", grey: "#63635e", rule: "#e3e3de", film: "#0a0a0a", pencil: "#d42a20", edge: "#f2a531", mark: "#b94713", code-bg: "#f1f1ec" }
    dark:  { ink: "#eef0e8", grey: "#adb5a7", rule: "#3a4438", film: "#0a0a0a", pencil: "#ff6b5e", edge: "#f2a531", mark: "#ffac7c", code-bg: "#202620" }
  site:
    light: { paper: "#ffffff" }
    dark:  { paper: "#171b18" }
  review-app:
    light: { bg: "#f4f4ef", surface: "#ffffff", ok: "#25633f", bad: "#b3261e", warn: "#785411", focus: "#b94713" }
    dark:  { bg: "#171b18", surface: "#202620", ok: "#8fdaac", bad: "#ffaaa4", warn: "#ead08a", focus: "#ffac7c" }
typography:
  family: "Archivo variable (weight 100-900, width 62-125%), self-hosted"
  notes: "Caveat Brush, site only, for pencil notes"
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas"
  display: { weight: 900, width: "62%", line-height: 0.88-0.92 }
  section: { weight: 850, width: "70%" }
  brand: { weight: 800, width: "75%" }
  frame-label: { weight: 600, size: 10-11px, width: "70%", tracking: 0.08em, case: upper }
rounded: { default: 4px, frame: 0 }
spacing: { measure: 66ch }
components: [film-strip header, framed thumbnail, frame label, pencil mark, contact sheet, stat row]
---

# Design Spine design system

Snapshot as of 2026-11-16. Two surfaces share this system: the website in `site/` and the
local review app in `src/ui/`. The shared tokens are declared in both files, because the
site deploys alone and the review app ships inside the npm package.
`tests/design-tokens.test.ts` fails when the two copies drift.

## Overview

The product photographs every screen of an app and asks a person to approve or reject each
one. The design borrows from a photographer's contact sheet: strips of film, frames with
orange edge printing, and a red grease pencil that circles the keepers and crosses out the
rejects. That metaphor is the identity. Use it where it explains the product, and nowhere
else.

- **Website (Persuade):** full commitment. Large condensed display type, a real contact
  sheet as the hero, pencil marks that draw themselves.
- **Review app (Operate):** restraint. The film appears as a frame around each screenshot and
  as a sprocket strip under the header. The work area stays calm paper so a person can review
  hundreds of screens without fatigue.

## Colors

- `ink` on `paper` or `bg` for all reading text. `grey` for secondary text, `rule` for lines.
- `film` is near-black in both themes. It is the material of a strip, not a theme color, so
  it does not invert in dark mode.
- `edge` (film-edge orange) labels frames and marks the one primary action. Use it on
  `film`, never as text on paper: the contrast is too low.
- `mark` is the accent on paper: progress, the flagged count, links.
- `pencil` means a human decision against the screen: rejected tiles, the reject mark.
- `ok`, `bad` and `warn` are status colors in the review app only. Approval stays green
  because people read it faster than any metaphor.

## Typography

One family, Archivo, used across its width axis instead of pairing typefaces.

- Display and h1: weight 900 at width 62%, tight leading.
- Numerals in stat rows: weight 850 at width 70%, tabular figures.
- Frame labels (viewport, theme, status above a thumbnail): weight 600, 10-11px, width 70%,
  uppercase, 0.08em tracking. This is the edge printing on the film.
- Body: Archivo 400. The site uses 17px; the review app uses 14px for density.
- Mono for routes, run ids, keyboard hints and code.

## Layout

- The site keeps prose to a 66ch measure.
- The review app is a sidebar route index plus a main column capped at 1800px.
- Thumbnails sit in an auto-fill grid with a 232px minimum.

## Elevation and depth

No shadows for depth. Hierarchy comes from the film frame, rules and type weight. The
inspector dialog uses a scrim, not a shadow.

## Shapes

- 4px radius on controls, cards and inputs.
- 0 radius on anything that is film: frames, strips, the header.
- Sprocket holes are a repeating linear gradient, 8px holes on a 16px pitch.

## Components

- **Film-strip header (review app):** `film` background, white brand, `edge` label, one
  `edge` primary button, sprocket row along the bottom.
- **Framed thumbnail:** a 6px `film` border around the screenshot, no radius.
- **Tile:** surface card, frame label row, framed thumbnail, status. Approved adds a 4px `ok`
  top rule; rejected adds a 4px `pencil` top rule.
- **Contact sheet view:** tiles become frames on a continuous strip; the pencil circles
  approved frames and crosses out rejected ones.
- **Route heading:** mono route with a 4px `edge` bar.

## Do's and don'ts

- Do keep the review app's work area on paper. The film is a frame, not a background.
- Do put status in text as well as color (`PENDING`, `Checks clear`).
- Do respect `prefers-reduced-motion` for every pencil or strip animation.
- Don't add a second typeface to the review app.
- Don't use `edge` orange for text on light backgrounds.
- Don't change a shared token in one file only; the token test will fail.
