import { spawn, spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Matches package.json engines.bun and the pin in action.yml; a test keeps them in step.
export const DOCKER_BUN_VERSION = '1.3.13'
// GitHub's ubuntu-latest is x64, so captures must be too, even on Apple silicon.
export const DOCKER_PLATFORM = 'linux/amd64'
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export const imageTag = (playwrightVersion: string, bunVersion = DOCKER_BUN_VERSION): string =>
  `design-spine-capture:${playwrightVersion}-bun${bunVersion}`

export const dockerfileText = (
  playwrightVersion: string,
  bunVersion = DOCKER_BUN_VERSION,
): string =>
  `FROM mcr.microsoft.com/playwright:v${playwrightVersion}-noble
COPY --from=oven/bun:${bunVersion} /usr/local/bin/bun /usr/local/bin/bun
`

/** Loopback hosts mean the host machine, which a container reaches as host.docker.internal. */
export function rewriteBaseForDocker(base: string): string {
  const url = new URL(base)
  if (!LOOPBACK.has(url.hostname)) return base
  url.hostname = 'host.docker.internal'
  const out = url.href
  const bare = url.pathname === '/' && !url.search && !url.hash
  return bare && !base.endsWith('/') ? out.slice(0, -1) : out
}

export function installedPlaywrightVersion(): string {
  const pkg = createRequire(import.meta.url)('playwright/package.json') as { version: string }
  return pkg.version
}

export interface CliLocation {
  /** Extra `-v` mount for a CLI that lives outside the project root. */
  mounts: string[]
  /** CLI path as seen inside the container. */
  path: string
}

export function locateCli(root: string, cliFile: string, packageDir: string): CliLocation {
  const rel = relative(root, cliFile)
  if (rel && !rel.startsWith('..') && !isAbsolute(rel))
    return { mounts: [], path: `/work/${rel.split(sep).join('/')}` }
  return {
    mounts: ['-v', `${packageDir}:/spine:ro`],
    path: `/spine/${relative(packageDir, cliFile).split(sep).join('/')}`,
  }
}

export interface InnerCapture {
  manifest: string
  base: string
  routes?: string
  concurrency: string
}

export function innerCaptureArgs(o: InnerCapture): string[] {
  return [
    'capture',
    '--manifest',
    o.manifest,
    '--base',
    o.base,
    ...(o.routes ? ['--routes', o.routes] : []),
    '--concurrency',
    o.concurrency,
  ]
}

export interface RunArgvInput {
  image: string
  root: string
  cli: CliLocation
  recordedBase: string
  inner: string[]
  /** Set on Linux hosts so files written into the project stay owned by the caller. */
  user?: { uid: number; gid: number }
}

export function dockerRunArgv(i: RunArgvInput): string[] {
  return [
    'run',
    '--rm',
    '--platform',
    DOCKER_PLATFORM,
    '--init',
    '--ipc=host',
    ...(i.user ? ['--user', `${i.user.uid}:${i.user.gid}`, '-e', 'HOME=/tmp'] : []),
    '-v',
    `${i.root}:/work`,
    ...i.cli.mounts,
    '-w',
    '/work',
    '--add-host=host.docker.internal:host-gateway',
    '-e',
    'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright',
    '-e',
    'SPINE_CWD=/work',
    // The run keeps the URL the host used, so review and reports read the same as a host capture.
    '-e',
    `SPINE_RECORDED_BASE_URL=${i.recordedBase}`,
    i.image,
    'bun',
    i.cli.path,
    ...i.inner,
  ]
}

function docker(args: string[], opts: { input?: string; quiet?: boolean } = {}) {
  return spawnSync('docker', args, {
    input: opts.input,
    stdio: [
      opts.input === undefined ? 'ignore' : 'pipe',
      opts.quiet ? 'ignore' : 'inherit',
      'inherit',
    ],
  })
}

export function assertDockerReady(): void {
  const info = spawnSync('docker', ['info'], { stdio: 'ignore' })
  if ((info.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT')
    throw new Error('--docker needs the docker CLI, but `docker` is not on PATH.')
  if (info.status !== 0)
    throw new Error(
      '--docker needs a running Docker daemon, but `docker info` failed. Start Docker or OrbStack.',
    )
}

export function ensureImage(playwrightVersion: string, log: (s: string) => void): string {
  const tag = imageTag(playwrightVersion)
  if (docker(['image', 'inspect', tag], { quiet: true }).status === 0) return tag
  log(`Building ${tag} (${DOCKER_PLATFORM}), first run only...`)
  const built = docker(['build', '--platform', DOCKER_PLATFORM, '-t', tag, '-'], {
    input: dockerfileText(playwrightVersion),
  })
  if (built.status !== 0) throw new Error(`docker build failed for ${tag}.`)
  return tag
}

export interface DockerCapture extends InnerCapture {
  root: string
  /** Base URL as the host sees it, before the loopback rewrite. */
  hostBase: string
  log: (s: string) => void
}

/** Runs `spine capture` inside the pinned Playwright image and resolves to its exit code. */
export async function captureInDocker(o: DockerCapture): Promise<number> {
  assertDockerReady()
  const image = ensureImage(installedPlaywrightVersion(), o.log)
  const cliFile = realpathSync(fileURLToPath(new URL('../cli.ts', import.meta.url)))
  const root = realpathSync(o.root)
  const cli = locateCli(root, cliFile, dirname(dirname(cliFile)))
  const getuid = process.getuid?.()
  const argv = dockerRunArgv({
    image,
    root,
    cli,
    recordedBase: o.hostBase,
    inner: innerCaptureArgs({ ...o, base: rewriteBaseForDocker(o.base) }),
    user:
      process.platform === 'linux' && getuid !== undefined
        ? { uid: getuid, gid: process.getgid?.() ?? getuid }
        : undefined,
  })
  return await new Promise<number>((done, fail) => {
    const child = spawn('docker', argv, { stdio: 'inherit' })
    child.on('error', fail)
    child.on('close', (code) => done(code ?? 1))
  })
}

/** Manifest path relative to the project root, since the container sees the root as /work. */
export function manifestInRoot(root: string, manifest: string): string {
  const rel = relative(root, resolve(root, manifest))
  if (!rel || rel.startsWith('..') || isAbsolute(rel))
    throw new Error('--docker needs the manifest inside the project root.')
  return rel.split(sep).join('/')
}
