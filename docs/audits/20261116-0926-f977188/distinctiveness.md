# distinctiveness audit, design-spine @ f977188

Run: 2026-11-16, AUDIT-ONLY. Surfaces: marketing site `site/` (applies) and review UI `src/ui/` (a tool; structural similarity is a note only).

Human input: is differentiation a stated brand goal? UNKNOWN as an explicit goal. `DESIGN.md` says the contact-sheet metaphor "is the identity" and the website is "Persuade: full commitment", so the site is judged against that intent. Findings below are labelled Low and treated as notes where they only describe category structure.

Method and limits: rendered at 1440 (`shots/site-fold-1440.png`, `shots/crawl-site/screens/00-home-1440.png`, `shots/ui-fold-1440.png`). No competitor pages were fetched, so the structural comparison and screenshot-grid test are NOT FETCHED. The substitution test is an inspection of the page (rung 3), not a swapped screenshot pair.

## Verdicts

- Substitution test: partially survives. The hero (giant condensed type, filmstrip of real captures with a hand-drawn red circle), the "Count the screens you did not open" matrix with sliders, the stress frames and the "Reject a frame yourself" demo are specific to this product. "Checked on every frame" (9 icon + title + blurb items), "Agents can look" (3 icon items), the "How it compares" table, "Moving from Lost Pixel" and the dark install band survive a name swap unchanged: they describe the developer-tool category.
- Structural fingerprint: nav matches the generic default (wordmark left, text links right, GitHub last). Hero is distinct (left-aligned, display type spans the width, command chip plus CTA row, then a filmstrip, no centred eyebrow/lede axis). Footer is distinct by omission (two short lines, no 4-column link grid). Competitors: NOT FETCHED.
- Repeat-of-prior-build: N/A for the site. The review UI was restyled to the site's system last week, which `DESIGN.md` states as intended ("two surfaces share this system"), so the shared skeleton is by design.
- Specific defensible design decision: the thumbnail is a film frame with edge-printed label (viewport, theme, status) and approval/rejection as pencil circle/cross marks on a contact sheet. It maps to how the product works (a grid of states a person triages), not to a template.
- Signature interaction present: yes. The matrix sliders multiply routes x states x widths x themes into a 96-cell strip and teach why states get missed; the "Try a review" demo draws the pencil mark on the screen state; the review UI's keyboard triage (j/k/a/r/u) and baseline "blink" (`b`) respond to real data. The scroll-linked strip slide and pencil draw are decorative and respect reduced motion.

## Findings and notes

| ID | Type | Sev | Conf | Location | Problem | Fix | Rung |
|---|---|---|---|---|---|---|---|
| DIST-001 | Note | Low | Medium | site sections "Checked on every frame", "Agents can look", "How it compares", install band | The film metaphor stops after the middle of the page; the lower third reads as a standard dev-tool landing page (icon grid, 3-up icons, comparison table, dark CTA band). `DESIGN.md` says to use the metaphor "where it explains the product, and nowhere else", so this may be intended. | If more identity is wanted, show the nine checks as frame labels/pencil marks on a sample sheet instead of generic line icons. Design decision, not a defect. | 3 |
| DIST-002 | Note | Low | High | review UI `src/ui/review.css`, `shots/ui-fold-1440.png` | Beyond the sprocket strip, framed thumbnails, condensed h1 and orange frame labels, the work area is a conventional dashboard: five-box stat row, filter pills, selects, equal-weight Inspect/Approve/Reject buttons. Approve/reject appear as green/red fills and top borders, not as the pencil marks the site uses. `DESIGN.md` prescribes this restraint ("Operate") and keeps approval green on purpose. | None required. Optional: a small pencil circle/cross glyph on decided tiles would tie the two surfaces together. | 4 |
| DIST-003 | Note | Low | Medium | site hero `site/index.html` (hero row) | The command chip and outlined "Read the quick start" button are a common dev-tool hero pairing. The type and filmstrip carry the differentiation; the chip does not hurt it. | None. | 3 |

Fidelity to `DESIGN.md` (code/render spot checks, rung 4): UI h1 renders Archivo 56px weight 900 condensed; mono used for routes, `.keys` and eyebrow; frame radius 0; header `film` stays black; frame labels are condensed uppercase 11px. Site frame labels are orange on film as specified; on paper (UI cards) they are grey, matching "never orange text on paper". Not checked: dark-theme visuals (axe only), `tests/design-tokens.test.ts` drift test (not run), Caveat Brush usage.

No concept-brief.md at the repo root checked (not looked for beyond `DESIGN.md`).

## Not covered
Competitor fetches and side-by-side grid, a swapped-name screenshot pair, dark-theme visual review, 768px layout, real captures in the review UI (fixture used grey placeholders, so the UI's look with real screenshots is untested).
