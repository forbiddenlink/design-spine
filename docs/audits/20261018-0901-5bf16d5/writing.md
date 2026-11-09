# writing (design-spine @ 5bf16d5)

Applies: yes (README, docs/USAGE.md, site/index.html, CLI output in src/cli.ts, review UI strings in src/ui/index.html). No browser was used, so rendered-state copy (error/empty toasts) was read in code only; visual findings NOT COVERED.

Method: scripted scan of all tracked .md/.ts/.html/.yml/.json/.js for U+2014 and U+2013, plus a case-insensitive grep of README, USAGE, SKILL, site, cli.ts, lib and UI for the pack's cliche list (seamless, robust, leverage, unlock, streamline, "designed to", "let's", "it's not just", etc.). Cliche list: 0 real hits (only CSS `text-transform`/`transform: rotate` matched "transform").

Total instances: 3 em dashes in user-facing runtime copy, 3 en dashes (ranges). 0 vocabulary instances.

```json
[
  {"id":"WR-001","area":"writing","severity":"Low","confidence":"High","location":"src/cli.ts:477; src/ui/index.html:323; src/ui/index.html:393","problem":"Em dashes appear in user-facing output: the lint line `${match.text} — ${match.reason}`, the review-UI percent placeholder `'—'`, and the coverage line `' — ' + entry.reason`.","impact":"Violates the no-em-dash rule for this project's copy; the README, USAGE and site have none, so these are the only leaks.","fix":"cli.ts:477 use ` : ` or ` - `; ui:323 use 'n/a'; ui:393 use ': ' (e.g. `outcome + (reason ? ' (' + reason + ')' : '')`).","verification":"Rerun the U+2014 scan; expect 0 hits in tracked files."},
  {"id":"WR-002","area":"writing","severity":"Low","confidence":"Medium","location":"README.md (How it compares table), site/index.html (How it compares)","problem":"Competitor claims (for example hosted tools: 'Plans the route x state matrix: No', 'Coverage gaps shown as unfinished: No') carry no source or check date.","impact":"A reader who knows Chromatic, Percy or Argos can dispute a cell, which costs credibility on the one table meant to persuade.","fix":"Verify each cell against current vendor docs, add 'as of <date>', or soften to what the project can prove.","verification":"Each cell has a vendor doc link or is removed."}
]
```

Optional, not a finding: en dashes in numeric ranges at docs/USAGE.md:76 ("0–1", "1–32", "0–65535") and src/lib/manifest.ts:24 (error text `${min}–${max}`) are range punctuation, not em dashes; use "to" if the rule is read strictly.

Voice verdict: reads as a real tool by one person: concrete, second person, no hype words, and honest Limits section (README.md "Limits"). Voice document: UNKNOWN (none in repo), so replacements are minimal edits only.

Coverage: writing: README, USAGE, SKILL, site text, CLI strings (grep), UI strings (grep) inspected; rendered error/empty states NOT COVERED (no browser run).
