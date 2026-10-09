# Moderated review-workflow study — prepared, not conducted

No participants have been recruited or observed. No task-success, satisfaction or superiority claims follow from automation. Use synthetic captures only; do not open participant repositories or collect names, client information, credentials or real screenshots.

## Questions and participants

Can reviewers distinguish changed evidence from a capture failure? Can they make and revise decisions confidently, save a useful note, recover from a failed save, and export a complete review? Does the viewer reduce repeated navigation? Can keyboard users complete the same tasks?

Recruit 5–8 developers who review visual changes, including frequent keyboard users. If comparing novice and experienced reviewers, recruit 5–8 per segment and report them separately. Liz chooses and contacts participants; this kit sends no messages. Use participant IDs P01–P08, obtain consent before any recording, and take anonymous task notes by default.

Method: 30-minute moderated remote or in-person session, think aloud, one facilitator and optional observer. Start with a non-participant pilot. Use a fresh copy of the generated 60-capture review fixture per participant; retain originals. Start the source CLI against that absolute run path. Fixture generator and workflow harness: browser-checks.ts, six groups of ten tiles, matching the application’s six comparison states. It is deliberately synthetic; realism and photographic diversity need a subsequent study.

## Tasks

Read scenarios without naming interface controls. Benchmarks below are research targets, not observed results. Ask SEQ after each task: “Overall, how difficult or easy was this task?” 1 very difficult to 7 very easy.

| Task and neutral scenario | Success evidence | Target |
| --- | --- | --- |
| 1. You have a new review batch. Find a screenshot whose visual appearance changed and explain the evidence. | Finds changed capture, opens current/baseline/difference; explains actual change rather than approval status. | 2 min |
| 2. Find a capture you cannot assess and explain why. | Distinguishes unavailable baseline and failed capture from a clean comparison. | 2 min |
| 3. Record that the changed capture needs revision, with “Header spacing needs review.” | Confirmed rejection and exact note in generated review.json; participant identifies saved state. | 2 min |
| 4. You reconsider: approve that capture, then find another item that still needs a decision. | Approval persists; finds another pending capture without losing draft or place. | 2 min |
| 5. The facilitator interrupts the save connection once. Keep your note and complete the save when the connection returns. | Sees failure, does not assume success, retries; exact note and decision persist. Facilitator uses harness interception, never damages stored files. | 3 min |
| 6. Using only the keyboard, inspect another screenshot, add a note and return to the sheet. | No pointer assistance; focus remains usable, Escape returns to the reviewed item; note saved. | 3 min |
| 7. Return after a page reload and prepare a review to share. | Reload retains confirmed decisions and notes; export contains expected IDs/decisions/notes. Does not send export externally. | 2 min |

## Facilitation

Introduction: “We are testing the tool. Please say what you expect and what you notice. You can stop at any time. These screenshots are generated examples. We will record task observations under a participant ID.” Obtain consent before continuing. Ask about review experience without employer or project details. Give one scenario at a time. Do not teach the interface. After 30 seconds of a stall ask, “What are you looking for?” Record any hint and score assisted completion separately. Stop a task at twice its target and explain the intended action only after scoring.

Debrief: What made you uncertain? When did you know a change was saved? What would stop you trusting an exported review? Which action felt unnecessarily slow? Collect the standard ten-item SUS questionnaire unchanged if licensed/available through the study organizer; do not invent substitute questions or calculate SUS from the SEQ ratings.

## Observation sheet and analysis

For each participant/task record: ID, segment, browser/input method, start/end seconds, success/assisted/failed, errors, retries, hint count, SEQ, anonymous quotation, observed problem and evidence. Keep expectations separate from observations. Leave outcome cells blank before sessions.

Analyze counts with denominators, median/range time and SEQ, repeated failure patterns and accessibility blockers; do not present a small convenience sample as population statistics. Prioritize data loss or wrong decisions first, blocked completion second, recurring confusion third, cosmetic preferences last. Change only demonstrated problems, then retest affected tasks. A “better than competitors” claim would additionally require a predefined comparable task set, counterbalanced order and actual participants using those competitors.

## Pilot and access checklist

- Fresh synthetic review fixture; known expected decisions; no original files or private data.
- Participant can open the local screen-share preview; confirm consent and anonymous notes.
- Failure interception can be switched on/off without changing product files.
- Task instructions do not reveal button names; observer can distinguish assisted success.
- Keyboard-only path, mobile-width view and download location verified before sessions.
- Clear stop conditions; no real baseline approval, production change or external sharing.

Native screen-reader session remains pending: verify title/landmarks; filter labels and counts; card names and diagnostics; dialog title/initial focus/background isolation; mode choices and screenshot alternatives; decision and save announcements; note label/limit; retry error recovery; close/focus return; export name and state. Record exact spoken output and user actions in VoiceOver, not inferred DOM or axe results. VoiceOver was off and native app access timed out on this machine; security settings were not changed.
