# Review workflow features — October 9, 2026

## Decision

Keep the existing local review design. Add decisions and notes to full-screen inspection, plus precise comparison-state filtering. The inspected screenshot is where a reviewer has enough evidence to decide; closing/reopening between every decision adds avoidable work. Exact evidence states make unavailable/missing captures discoverable without confusing them with unchanged results.

Alternatives considered: a separate triage dashboard duplicates the existing review; bulk approval bypasses individual inspection; history/team features require stored-format or service changes. Neither is appropriate for this phase.

## Contract and scope

- Viewer: Approve/Reject toggle existing decisions, edit notes with the same 2,000-character limit, explicitly save a note or include it with a decision; next pending within the filtered screenshot set. Drafts survive viewer navigation/close. Visible pending/failure/retry feedback inside the dialog; no optimistic sign-off. Review state stays synchronized with cards.
- Keep the current screenshot after a decision when it still matches filters. If it leaves the filtered set, advance to the next available neighbor; close with focus restored when none remain. Failed saves keep the current screenshot and draft.
- Comparison filter: all, new, changed, dimensions changed, within threshold, no capture, unavailable. Combines with existing filters/pagination/viewer. Disabled during comparison loading/failure. Existing Only changed shortcut retained. On fresh comparison success, matching membership updates without discarding note drafts.
- No new APIs, storage formats, dependencies, routes, paid services or baseline mutations. Existing unrelated example files untouched.

## Verification

Use isolated generated runs with all six comparison states and >48 captures. Browser checks at desktop/mobile and light/dark: exact/combined filters, loading/failure/retry, decisions/undo, draft survival, note limits, failed save/retry, newer edits during delayed save, next pending, filtered removal, empty completion, pagination, focus and reload persistence. Screenshot review and viewer before/after. Run all unit tests, typecheck, lint and HTML build; independent standards/spec review of pinned feature commit. Python Playwright unavailable in the project environment; use the existing installed TypeScript Playwright package with Bun, no installation.

Outstanding earlier limits remain: actual VoiceOver blocked, idle resident memory unresolved, other physical devices/engines untested. This feature phase does not assert those are resolved.
