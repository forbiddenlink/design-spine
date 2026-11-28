# container audit: Docker capture path

Run: 20261116-0926-f977188 | Mode: AUDIT-ONLY | Scope: `spine capture --docker` (src/lib/docker.ts, tests/docker.test.ts, docs/USAGE.md "Matching CI baselines", action.yml docker input) | Commit f977188, branch fix/pr-d, tree clean at start | Env: local (OrbStack, Docker 29.9.3, darwin arm64) | docs/audits/ left untracked, .gitignore not edited.

Gate: not N/A. The repo has no Dockerfile, compose file or .dockerignore (find, maxdepth 3, zero hits; command ran). The Dockerfile is generated inline at src/lib/docker.ts:16-22 and fed to `docker build -` on stdin (docker.ts:163-165). ARG/ENV names set by the repo: none. Run-time env names passed: HOME (Linux only), PLAYWRIGHT_BROWSERS_PATH, SPINE_CWD, SPINE_RECORDED_BASE_URL, SPINE_HOST_ROOT. No secret is forwarded.

## Image facts (docker image inspect on design-spine-capture:1.63.0-bun1.3.13)
- Base: `mcr.microsoft.com/playwright:v1.63.0-noble` (tag, no digest) + `COPY --from=oven/bun:1.3.13` (tag, no digest). Single stage; no multi-stage, none needed.
- User: unset, so root. Entrypoint null, Cmd /bin/bash, no HEALTHCHECK (one-shot container, N/A).
- Size 2.61 GB, amd64/linux. Largest layer 765 MB (base image RUN). bun layer 101 MB.
- RepoDigests empty (local build). The base image is not in the local store, so no base digest could be recorded.
- Layer history scanned by count only: 0 layers match secret/token/passw/api-key.
- I did not rebuild the image or run a scanner (audit-only; docker build executes RUN steps; load avg ~180).

## Findings

| ID | Sev | Conf | Location | Rung |
|---|---|---|---|---|
| CTR-001 | Medium | High | docker.ts:117, :121-:131, image User unset | 3 |
| CTR-002 | Medium | Medium | docker.ts:16-22, :159-168 | 3 |
| CTR-003 | Low | Medium | docker.ts:104-136 | 2 |
| CTR-004 | Low | Medium | docker.ts:201, :234-267 | 3 |
| CTR-005 | Low | Low | docker.ts:185-197, :121 | 2 |
| CTR-006 | Info | High | docker.ts:43-47 | 4 |

**CTR-001 | Medium | High | docker.ts:117 (rw bind of project root), :110-111 (`--ipc=host`), :121 (`--network host` on Linux), image runs as root on non-Linux (docker.ts:116, no `--user`)**
- Problem: Chromium that renders the app under test runs with the whole project root mounted read-write at /work (includes .git, .env*, and on Actions the checkout's persisted token in .git/config), host IPC, and on Linux the host network. On macOS the container user is root (verified `id -u` = 0 in the image). Playwright runs Chromium without its sandbox by default.
- Impact: a hostile or compromised page (third-party script, PR-supplied app code in CI) that escapes the renderer can read or rewrite repo files and, on Linux CI, reach host loopback services and the cloud metadata address. CI runs as the runner uid (docker.ts:195), which limits file damage to what that uid owns, which is the whole checkout.
- Exploitability: needs a renderer exploit or hostile in-page code; capture is normally of the user's own app. Not trivially triggered.
- Fix: mount the root read-only and bind only `.design-spine/` (and the baselines dir the capture writes) read-write; replace `--ipc=host` with `--shm-size=1g` (scripts/visual-tests.ts:37 already uses `--shm-size=256m`); add `--cap-drop=ALL --security-opt no-new-privileges`; always pass `--user` (use 1000:1000 or the caller uid on macOS too). Host network on Linux is the cost of "localhost works"; alternative is `--add-host=host.docker.internal:host-gateway` on Linux plus the same URL rewrite (Docker 20.10+).
- Verification: after the change, `docker run` the argv with `--entrypoint sh` and confirm `touch /work/x` fails while `.design-spine/` writes succeed.
- Evidence: code walk of dockerRunArgv; `touch /work/x` read-only result verified only for the `readonly` mount form, root verified by running the image (rung 4 for root, 3 for the rest).

**CTR-002 | Medium | Medium | docker.ts:20-21 (tag-only FROM and COPY --from), :159-163 (cache keyed by tag only)**
- Problem: (a) both source images are mutable tags, no digest. (b) `ensureImage` skips the build whenever a local image with the tag exists (docker.ts:161), and the tag encodes only playwright and bun versions (docker.ts:13-14). Any later change to `dockerfileText` (for example adding `USER`, CTR-001's fix) never reaches users who already built the tag. Same for a rebuilt upstream tag.
- Impact: pixel-identical baselines (docs/USAGE.md:61, :69) rest on tags not moving; a tag re-push changes fonts or the base on one machine and not another with no signal. A fix to the Dockerfile silently does not apply to existing images. The prior audit declined digest pinning on the ground the image is built locally from two official images (delta.md SEC-F4); that reasoning understates the exposure because the container has a rw repo mount (CTR-001).
- Fix: add a Dockerfile revision or a hash of `dockerfileText` to the tag (`...-bun1.3.13-r1` or `-<sha8>`), and pin both bases by digest in the generated text, updated by Renovate with the Playwright bump (renovate.json already groups Bun).
- Verification: unit test that a change to dockerfileText changes imageTag. Could not confirm that mcr re-pushes `-noble` tags (hypothesis; rung 2).

**CTR-003 | Low | Medium | docker.ts:104-136**
- Problem: no `--memory`, `--cpus`, `--pids-limit`, `--cap-drop`, `--security-opt`. Concurrency is up to 8 pages (USAGE.md:33) in one container.
- Impact: a runaway page can take the host's memory; relevant on a 7 GB runner.
- Fix: `--memory` (configurable), `--pids-limit=1024`, and the cap flags from CTR-001. Rung 2.

**CTR-004 | Low | Medium | docker.ts:201, :234-248, :261-267**
- Problem: the stale sweep calls `docker rm -f` on every container that carries label `design-spine.pid` with a numeric value whose pid is not alive on THIS host. It does not check that the name starts with `design-spine-capture-`, and it cannot tell pid namespaces apart.
- Answer to "can it remove a container it did not create": only a container that carries the `design-spine.pid` label, so the `*_vitrine` Supabase containers and any unlabelled container are out of reach (filter is label-key only; I confirmed no container with that label exists now). It can remove a live capture started by another CLI whose pid is not visible here: two runs sharing one Docker daemon from different hosts (remote DOCKER_HOST, a shared CI daemon) or different pid namespaces (devcontainer or a CI job container using the host socket). Pid reuse only errs toward keeping a stale container, which is harmless.
- Impact: a second user's in-flight capture is killed and exits non-zero with no explanation. Needs shared-daemon setup.
- Fix: also label with hostname (`design-spine.host=$(os.hostname())`) and only sweep rows whose host matches; filter on the name prefix. Rung 3 (code walk, staleContainers tests exist at tests/docker.test.ts but cover parsing only).

**CTR-005 | Low | Low | docker.ts:185 (`process.platform === 'linux'` selects host network and --user), docker.ts:10**
- Problem: platform detection uses the Node host OS, not the daemon. Linux with Docker Desktop for Linux (VM daemon) or WSL2 with Docker Desktop makes `--network host` bind the VM, so a localhost-only app is unreachable. `--platform linux/amd64` on an arm64 Linux runner runs under emulation or fails without binfmt. Rootless Docker maps `--user uid:gid` differently from rootful.
- Impact: capture fails with connection refused or an exec format error, with the generic message. Hypothesis, not run (no such host available). Fix: use `docker info --format '{{.OperatingSystem}}'` to choose, and document arm runners.

**CTR-006 | Info | High | docker.ts:43-47 `bindMount`**
- Question "can the mount string be injected via the CSV quoting": no. I generated the argv for a source directory literally named `a,target=/etc` and one named `q"x`, then ran them against the real daemon (`--rm`, label `design-spine.audit=1`, `--network none`, `--entrypoint ls|sh`). Result: `/work` listed the directory's own file (MARK), `/etc` was untouched, and the `readonly` variant rejected a write (`Read-only file system`). Containers were removed by `--rm`; `docker ps -a --filter label=design-spine.audit=1` returns 0. A newline in a path was not tested. `readonly` and `target` are appended outside the quoted field, so the path cannot inject options.
- Note: the earlier DOCKER-COLON decision ("Leave", delta.md) is superseded by 856b021, and USAGE.md does not mention that the new constraint is a CSV one.

## Linux CI vs macOS (OrbStack) summary
- Linux (action.yml default): `--network host`, no URL rewrite (docker.ts:193), `--user uid:gid`, `HOME=/tmp`. App must be on localhost or all interfaces. USAGE.md:69 claims a 12-tile zero-pixel match verified 2026-10-18; not re-run here.
- macOS: `--add-host=host.docker.internal:host-gateway`, loopback bases rewritten (docker.ts:25-32), container root, app must listen on all interfaces (USAGE.md:75). Image runs under emulation on Apple silicon; I ran two short containers under it successfully.
- action.yml:68 passes `--docker` when `docker` is `"true"`; the runner's docker daemon is used; no `--ignore-scripts` issue here (npm step covered in prior audit).
- test:visual (scripts/visual-tests.ts:27-44) uses the same image with `--network none`, `:ro` project mount and `-v`, not `--mount`, so a path with a colon still breaks there (Low, outside the capture path; mentioned for completeness).

## Coverage matrix
| Area | Status | Reason |
|---|---|---|
| Image definition, base, pinning | inspected | CTR-002 |
| Layer history secret count | verified | count 0, history lines not printed |
| Root / mounts / network / caps | verified (code + image) | CTR-001, CTR-003 |
| Mount quoting | verified (ran) | CTR-006 |
| Sweep scope | inspected + queried labels | CTR-004; sweep itself not executed |
| Linux CI run | not covered | no Linux host; code only |
| Docker Desktop behaviour | not covered | only OrbStack available; docker context list also shows `desktop-linux`, unused |
| Image rebuild from scratch, size by layer on fresh build | not covered | audit-only, load avg ~180 |
| docker scout / trivy | not covered | not run |
| SIGTERM/SIGINT cleanup path | inspected only | not exercised live |
| GitHub Action end to end | not covered | no run |
| Host OS, firewall, TLS | N/A | no self-hosted deploy |

## Not done / refute pass
Re-read docker.ts:104-136, :159-168, :201, :234-267 and action.yml:34-68 after drafting. Dropped one candidate: `--init` plus `process.exit` in signal handlers (docker.ts:208) removes the container on SIGINT/SIGTERM through the 'exit' hook; sound. Dropped "no HEALTHCHECK" as N/A for a one-shot run.

## Smallest next action
Add the Dockerfile revision to `imageTag` (CTR-002b) in the same change that makes the project mount read-only except `.design-spine/` (CTR-001), so existing local images rebuild.
