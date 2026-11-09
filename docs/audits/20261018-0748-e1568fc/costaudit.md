# costaudit (commit e1568fc)

N/A by gate: no paid service in the repo. Dependencies are open source (package.json: @axe-core/playwright, commander, pixelmatch, playwright, pngjs). No hosting, database, domain or SaaS config found (no vercel.json, netlify.toml, wrangler.toml; precheck shows no Sentry, no auth, no Doppler). The only metered thing is the optional `critique` command, which shells out to the user's `claude` binary (src/cli.ts:187; docs/USAGE.md:32), billed to the owner's existing Claude account; plan and per-run cost UNKNOWN (HUMAN INPUT).

Service list: none paid. Findings: none.
