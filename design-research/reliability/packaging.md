# Local executable verification

`pnpm build` bundles the CLI, the comparison-worker entry and HTML into design-research/build/spine. Bun 1.3.13 emits the worker as lib/comparison-worker.js relative to the embedded main URL; the build defines import.meta.spineWorker explicitly. Source execution keeps its existing module-relative worker. HTML uses the file import loader; String() bridges the older TypeScript HTMLBundle declaration to the runtime file path.

Confirmed on local macOS arm64, with the executable launched from an isolated directory without node_modules: embedded viewer HTML; comparison report and PNG output; confirmed decision/note persisted to synthetic review.json. packaging-outside.json and packaging-smoke.ts contain evidence/reproduction. packaging-capture.json additionally records two successful Chromium light/dark captures of generated local HTML, using the installed browser cache.

Retained failed probes document external-package, asset and worker-path errors; final-confirmed passed in a nested checkout directory and did not meet the outside-checkout criterion; packaging-outside is the corrected passing review probe. Chromium BiDi and Electron optional dependencies are excluded from bundling, not supported by this verification. No external Claude invocation, cross-compilation, installer, signed release, publish or distribution claim. Browsers and Claude remain separate local prerequisites for their respective commands.

Mechanism reference: [Bun executable documentation](https://bun.sh/docs/bundler/executables); local behavior and paths were checked against this installed runtime rather than assumed from newer docs.
