# Design and implementation plan

## One direction: editorial review desk

An image-led working application with a narrow index sidebar, warm paper canvas, decisive typography, and orange section markers. References: Visual Society's indexing; Boc.Studio's near-black/orange restraint; Butter's monochrome clarity; pen.dev's direct product presentation; House of Honey's typographic identity. Preserve honest capture evidence: no decorative stock photos, fabricated customer logos, or invented business metrics.

- Type: local system sans stack for control legibility and zero font requests; a 40–48px tightly tracked page title; 18–22px route titles; 14px body/controls; 11–12px monospace metadata. Fonts are intentionally not externally hosted or licensed.
- Palette: paper #f7f6f2, surface #fff, ink #20231f, muted #62675e, line #dedfd7, orange #b94713. Dark: #171b18, #202620, #eef0e8, #adb5a7, #3a4438, orange #ffac7c. Green/red/amber status stays semantic and includes text. Separate interface theme from capture theme.
- Spacing: 4/8/12/16/24/32/48/64px. 208px sidebar desktop; comfortable content margins; two to four consistent-height screenshot columns depending on width; single column mobile; toolbar wraps without horizontal overflow.
- Layout: identity and workspace controls in header; route index at left; title, run context, review progress, filters, then grouped route/state evidence. On mobile index becomes a compact horizontal scroll area, all controls stay reachable, card actions are at least 44px tall.
- Imagery: actual screenshots, equal-height preview wells with contain framing, explicit full-size action; no crop that hides evidence in viewer.
- Motion: brief 120–180ms state transitions only; no intro, parallax, or animated counter. Reduced-motion disables transitions and smooth scrolling.
- Shared components: application header, route nav, buttons, labeled search/select/notes, counters/progress, screenshot cards, diagnostic details, status banners, dialog and footer. Existing routes and endpoints stay unchanged.

## Ranked feature implementation

1. Save validation/recovery: pessimistic confirmed state, in-flight disabled decisions, serialized saves per tile, visible errors and retry, preserve failed note drafts. No schema changes.
2. Search/filter/index: route/state search; flagged/unreviewed toggles retained; approved/rejected status, arbitrary captured viewport, capture theme selects; clear filters and live result count. No schema changes.
3. Review progress and completion: counters, reviewed fraction, progressbar and next-pending action. Clean diagnostics do not imply approved. No baseline mutation.
4. Native dialog: Escape/focus return, fit/actual image sizing, next/previous through current filtered set, screenshot loading failure message, explicit close and download screenshot.
5. States: loading, initial-load error + retry, empty run, no filter matches + clear, saving, saved, failed save + retry, missing screenshot, critique error/pass/fix.
6. Export current full run, confirmed review and critiques as JSON via a local browser download. Warn when unsaved changes exist; do not send data externally.
7. Diagnostic details: display capture warnings and clipped-text warnings alongside raw errors in expandable details.

Needs approval: hosted storage/accounts/collaboration, paid APIs, persistent annotations, schema migrations, route changes, destructive capture cleanup. No bulk approval or automated baseline promotion.

## Template plan and phases

| Product template/state | Change | Verification |
| --- | --- | --- |
| `/` review, all route/state groups | Foundation, title/run context, route nav, summary/progress, search/filters, consistent cards | Two desktop/mobile screenshot/score/fix rounds; keyboard and filter journeys |
| Image viewer | Accessible modal, fit/actual, previous/next, image download | Desktop/mobile, keyboard focus return, image failure |
| Empty/no results | Distinct messages and usable recovery | Intercept empty data; filter to zero; screenshot both widths |
| Loading/error | Stable shell, live status, explicit retry | Delay/fail GET with Playwright; screenshot both widths |
| Saved/failed review | Visible confirmation, drafts and retry | Intercept POST 500/network failure; persisted reload; no false confirmation |
| Critique/diagnostic states | Structured expandable evidence | Fixture payload with warnings, pass/fix/error; real captured flags |
| Fixtures `/`, `/cards`, `/about` | Preserve intentionally imperfect content | Existing captured desktop/mobile light/dark evidence; no redesign |

Phase 4 commits foundation and two reviewed homepage iterations. Phase 5 completes viewer, state and workflow work. Phase 6 runs Bun build, TypeScript, Biome, Vitest, browser journeys and Lighthouse where available. Phase 7 delivers report and stops without merge.

Rubric order: point of view, typography, layout/rhythm, color/imagery, motion, audience fit, memorability, craft. Score actual browser captures and tests; 4 means strong and fit-for-purpose, not a claim of external award quality. Rework any score below 4 and retain evidence of both rounds.
