# Functional improvements

A = bug/unmet behavior; B = small justified workflow improvement; C = approval decision.

| Class | Improvement | Outcome |
|---|---|---|
| A | Invalid diff ratio silently passes a changed screenshot | Fixed; finite 0–1 validation and boundary/invalid command tests |
| A | Invalid concurrency/limit/port defaults, truncates or skips work | Fixed; validated before browser/provider/server starts |
| A | Different routes/states map to one capture filename | Fixed by preflight refusal; existing naming preserved |
| A | Damaged review treated as absent and overwritten | Fixed; malformed file/entries rejected, bytes preserved and POST refused |
| A | Screenshot symlink escapes run; malformed encoding throws | Fixed; recorded-file/canonical containment and 400 decoding response |
| A | Save status inserts content between pointer down/up, losing Inspect click | Fixed; stable status space, verified with failed note saves |
| A | Explicit app file accepted as a directory | Fixed; directory requirement and regression |
| B | Recorded diagnostic coordinates disconnected from screenshot | Built; current-only outlines, toggle and region jump |
| B | Expired evidence requires page reload despite failed drafts | Built; refresh comparison in place and restore viewer/download |
| C | Change filename convention and migrate existing evidence | Deferred to design-research/needs-approval.md |
| C | Stored metadata/history, forced animation policy, hosted services, schema/route changes | Deferred; full approval list remains in design-research/needs-approval.md |

No extra paid services, accounts, production changes or destructive cleanup were added. Existing native controls were tested and retained.
