# gha-workflow-security

N/A. `.github/workflows/` does not exist: `ls .github/workflows` returned "No such file or directory", `git ls-files | grep -E '^\.github|workflows'` returned nothing, and `find` for *.yml/*.yaml outside node_modules found only pnpm-lock.yaml. No other CI system config (GitLab, CircleCI, etc.) is tracked either.

Related, not a workflow finding: the repo has no CI at all, so the strict gate (`spine diff --strict`) and `vitest` run only locally. That is a coverage gap for other modules, not an Actions attack surface.
