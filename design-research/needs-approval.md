# Needs approval

Not implemented:

- Hosted accounts, team collaboration, cloud capture storage, paid visual testing integrations, and API keys: introduce services, cost, and data-boundary decisions.
- New persistent run metadata, CMS/schema changes, or database migrations: not needed for the chosen local review workflow.
- Removing or restyling intentionally imperfect demo fixture pages: would weaken capture diagnostics; preserved.
- Deleting existing captures, baselines, or example data: preserved.
- Changing existing routes or automatically promoting screenshots to baselines: preserved existing explicit CLI workflow.

No destructive or production changes are authorized or planned.

Follow-up research: persisting browser/commit/capture-readiness metadata or comparison history requires approval before changing the stored content shape. Reading existing baseline provenance and diff artifacts does not require those new fields.
