# Reliability follow-through — October 9, 2026

Branch: design/upgrade. Implementation 261f92e; packaging evidence correction 087cde4. No merge, push, production change or release. This phase improves demonstrated reliability and verification; it does not establish superiority over every competing product.

## Subsequent comparison performance follow-up — October 9, 2026

A focused follow-up now avoids redundant PNG decoding for byte-identical baseline/current files. The existing pixel comparison and encoding remain unchanged. Fresh checks: 79 tests, typecheck, lint (existing warning), compiled build; 24-pair worker evidence and a 240-pair HTTP request with 480 exact evidence hashes verified against the original pipeline. The HTTP request completed in 54.4 seconds. This is one successful observation, not a matched timing comparison or a general timeout/memory claim. See [follow-up evidence and limits](memory-findings.md#follow-up-avoid-redundant-decoding--october-9-2026). All phase-specific results below describe the earlier reliability checkpoint.

## Changes and evidence

- Completed comparison jobs no longer keep caller screenshot maps alive through the queue and idle timer callback. New regression reproduced the defect before repair and passes after repair. Four-snapshot server evidence cache and comparison bytes/thresholds remain intact. See [memory findings](memory-findings.md).
- `pnpm build` creates a local executable with embedded viewer HTML and correctly resolved compiled comparison worker. Copied executable outside the repository passes viewer/worker/PNG/save checks, and captures generated local HTML in light and dark Chromium. See [packaging scope](packaging.md), packaging-outside.json and packaging-capture.json. Optional BiDi/Electron paths, installers, cross-platform execution and Claude integration are untested.
- Reviewed the supplied prompt pack's 160-item inventory and 15 relevant full prompts; applied local tooling checks rather than unrelated SaaS/CMS/cloud instructions. See [selection and authority](prompt-pack-review.md).
- Prepared a [moderated usability study](usability-study.md) with seven synthetic tasks, participant criteria, success metrics, facilitation and a screen-reader checklist. It has not been conducted; no participants contacted or data collected.

## Verification

| Check | Result / scope |
| --- | --- |
| Unit tests | 76 / 12 files pass; includes released worker-evidence regression and existing output/queue-failure checks |
| TypeScript | No-emit check passes |
| Lint | Exit 0; pre-existing capture.ts:247 non-null warning remains |
| Build | Embedded CLI build passes on Bun 1.3.13/macOS arm64 |
| Chromium / Firefox / WebKit | 164 complete workflow assertions each, 492 total; 1280px and 390px, both themes |
| Responsive / keyboard | 182 assertions pass at 320x780, 375x812, 768x1024, 1024x768, 1440x900, 1920x1080, 844x390; reduced motion, forced colors at 375px, background inertness, note-save visibility, Escape/focus return |
| Axe | Eight scoped scans per engine, zero violations; four incomplete contrast results per engine remain incomplete (clipped route links and scrolled note helper) |
| Secrets | Gitleaks implementation commit scan: no leaks; full redaction; not a whole-repo security audit |
| Production dependencies | Public registry audit: zero reported advisories across five production dependencies; does not cover dev dependencies or prove absence of vulnerabilities |
| Lighthouse | Not rerun: no UI/style change in this phase. Prior desktop/mobile 100/100/100 evidence remains in review-workflow/report.md; not a new audit claim |
| VoiceOver | Blocked: off; native app access timed out. No security settings changed; no spoken-output claim |

Browser versions and raw assertions/audits are retained per engine in environment.json, checks.json and accessibility.json. Screenshots come from actual installed browser engines with viewport emulation, not physical devices or Safari application testing. The synthetic image content is diagnostic fixture material, not a new design proposal.

Native modal Tab can reach browser chrome: the document loses focus, while background page controls remain inert. The harness distinguishes this from page-focus escape. Close/focus checks await native completion and evaluate identity in one browser operation. These test corrections did not require a product focus-trap rewrite.

## Visual coverage

No UI template, text, CSS or route changed in this phase. The previous [visual before/after and rubric](../review-workflow/report.md) remain applicable: point of view 4, typography 4, layout 4, color/imagery 4, motion 4, audience fit 5, memorability 4, craft 4. These are internal assessments, not external awards or participant results. Current browser evidence follows.

| Template/state | Desktop | Mobile |
| --- | --- | --- |
| Review sheet | [Chromium](chromium/after-review-light-1280.png) | [Chromium](chromium/after-review-light-390.png) |
| Viewer / note | [Firefox](firefox/after-viewer-light-1280.png) | [Firefox](firefox/after-viewer-light-390.png) |
| Dark viewer | [WebKit](webkit/after-viewer-dark-1280.png) | [WebKit](webkit/after-viewer-dark-390.png) |
| Failed save / retry | [WebKit](webkit/failed-save-light-1280.png) | [WebKit](webkit/failed-save-light-390.png) |
| Narrow / landscape | [Landscape](responsive/viewer-844x390.png) | [320px](responsive/viewer-320x780.png) |

Review/viewer/loading/comparison error/retry/decision success/filtered empty/pagination/export journeys pass the 164-check workflow in each engine. Earlier diagnostic, load-error, missing-image and empty-run regression evidence remains in review-workflow/regression; those older 72 checks were not rerun in this phase. No untested template is newly marked done.

## Review and limits

Independent standards review of 53bae77..261f92e found no actionable issues. Specification review found P2: the first packaging fixture was isolated but still beneath the checkout. Corrected tests copy the executable and run fixtures outside the repository, eliminating ancestor dependency masking. Follow-up pinned review 261f92e..087cde4 confirms resolved. Earlier nested-fixture “outside checkout” claims in retained probe JSON/progress are superseded by packaging-outside.json and this report. Browser zoom was mentioned as a lead but not tested; viewport resizing is not browser zoom.

The direct 240-pair memory probe releases live external evidence after idle (86 MiB before, 0 after), but RSS did not improve consistently. The actual server retains 173 MiB of evidence after two snapshots as expected; one successful retry ended around 620 MiB RSS, with comparisons ~99.5/97.7 seconds. A failed run hit a connection reset. Native allocator counters underflowed and cannot support attribution. Large-batch latency, timeout margin, high-entropy workloads and multi-hour stability remain unresolved; next session should isolate performance from browser/build load before choosing a fix. Do not claim the reference fix solves overall memory or scale.

Other pending coverage: actual VoiceOver, physical devices, Safari application, browser zoom, participant study, full local request-boundary security audit, dev-dependency advisories, distribution/installers. Figma/Canva/other design tools were offered by the user; this mechanical reliability phase did not require a design artifact or external account write. No confidential repos, original examples, baselines or client data were accessed.

## Approval list

No new approval-requiring change was introduced. Full existing list follows unchanged.

# Needs approval

Not implemented:

- Hosted accounts, team collaboration, cloud capture storage, paid visual testing integrations, and API keys: introduce services, cost, and data-boundary decisions.
- New persistent run metadata, CMS/schema changes, or database migrations: not needed for the chosen local review workflow.
- Removing or restyling intentionally imperfect demo fixture pages: would weaken capture diagnostics; preserved.
- Deleting existing captures, baselines, or example data: preserved.
- Changing existing routes or automatically promoting screenshots to baselines: preserved existing explicit CLI workflow.

No destructive or production changes are authorized or planned.

Follow-up research: persisting browser/commit/capture-readiness metadata or comparison history requires approval before changing the stored content shape. Reading existing baseline provenance and diff artifacts does not require those new fields.

Capture stability experiment: forcing `animations: 'disabled'` completes finite animations and resets infinite animations during screenshot capture. This changes visual semantics and may alter existing comparisons. It was tested only on a generated page and was not applied to the default pipeline. A configurable policy and its baseline implications need approval before implementation.

Functional audit follow-up: introducing a collision-proof filename convention and migrating existing captures/baselines would change evidence identity and existing files. This audit rejects colliding combinations before capture instead; any naming migration needs approval. Existing route URLs and formats are preserved.
