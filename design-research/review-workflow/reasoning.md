# Reasoning

The current browser-loaded review at localhost:14870 offers inspection/comparison, but decisions and notes exist only on cards behind the dialog. Adding actions to inspection improves the central evidence-to-decision workflow. Exact comparison states expose missing/unavailable evidence which Only changed intentionally excludes. Keep existing card controls and shortcuts; no bulk approvals or automatic baseline promotion.

Use explicit note saving inside the viewer to avoid blur-triggered saves disabling a decision button before its click. Decisions include the current note draft. Unsaved drafts remain in the same session-wide map and appear on cards after close. Browser unload guard continues to protect unsaved work.

Browser testing exposed native dialog focus restoration resetting the selected tile to the original opener after navigating across a page boundary. The close handler now uses the viewed screenshot ID to restore focus on its correct page. Early harness corrections cleared a deliberately incompatible search before asserting another comparison state and awaited native close completion before checking synchronized cards.

Mobile screenshot round 1 left too little room for evidence with notes open. Round 2 moves Close alongside the title and hides diagnostic controls only when there are no supported regions; real region inspection remains available. Existing inspection-button focus is preserved when returning to the same capture; navigation across pages returns to the newly viewed capture.

Independent spec review caught two real bugs: returning to the pre-request saved note while another value is pending incorrectly removed the newer draft; retries removing a middle filtered capture jumped to the first result. Both were reproduced before repair (pre-fix-reverted-note.json and pre-fix-retry-neighbor.json). Inputs now preserve edits during pending saves, including the original saved value. Decisions and retries share neighbor reconciliation based on screenshot identity; multiple failed decisions can be retried without index shifts skipping the next screenshot. Added browser regressions for these cases.

New mobile note help inherited a 9.17px small-text size; raised to 12px for readability. Scrolled containers can still leave axe contrast checks incomplete; retain those separately and check visible helper text directly rather than claiming incomplete checks passed.
