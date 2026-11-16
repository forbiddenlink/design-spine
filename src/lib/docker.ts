import { spawn, spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256 } from './hash.ts'

// Matches package.json engines.bun and the pin in action.yml; a test keeps them in step.
export const DOCKER_BUN_VERSION = '1.3.13'
// GitHub's ubuntu-latest is x64, so captures must be too, even on Apple silicon.
export const DOCKER_PLATFORM = 'linux/amd64'
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

// The tag carries a hash of the Dockerfile, so changing the recipe builds a fresh image instead
// of reusing one built from the old recipe.
const IMAGE_REPO = 'design-spine-capture'
export const imageTag = (playwrightVersion: string, bunVersion = DOCKER_BUN_VERSION): string =>
  `${IMAGE_REPO}:${playwrightVersion}-bun${bunVersion}-${sha256(dockerfileText(playwrightVersion, bunVersion)).slice(0, 12)}`

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

/**
 * A `--mount` bind. Unlike `-v src:dst`, it keeps a colon in the host path. The value is CSV,
 * so a source holding a comma or quote is wrapped in quotes with inner quotes doubled.
 */
export function bindMount(source: string, target: string, readonly = false): string[] {
  const field = `source=${source}`
  const quoted = /[",]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field
  return ['--mount', `type=bind,${quoted},target=${target}${readonly ? ',readonly' : ''}`]
}

export interface CliLocation {
  /** Extra mount for a CLI that lives outside the project root. */
  mounts: string[]
  /** CLI path as seen inside the container. */
  path: string
}

export function locateCli(root: string, cliFile: string, packageDir: string): CliLocation {
  const rel = relative(root, cliFile)
  if (rel && !rel.startsWith('..') && !isAbsolute(rel))
    return { mounts: [], path: `/work/${rel.split(sep).join('/')}` }
  return {
    mounts: bindMount(packageDir, '/spine', true),
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
  /** Container name, so an interrupted run can remove it and a later run can find it. */
  name: string
  /** Set on Linux hosts so files written into the project stay owned by the caller. */
  user?: { uid: number; gid: number }
  /**
   * Linux hosts share the host network, so an app bound only to localhost (the usual CI
   * setup) is reachable without rewriting the URL. Docker Desktop and OrbStack use
   * host.docker.internal instead.
   */
  hostNetwork?: boolean
}

export function dockerRunArgv(i: RunArgvInput): string[] {
  return [
    'run',
    '--rm',
    '--platform',
    DOCKER_PLATFORM,
    '--init',
    // The browser renders untrusted pages; give it shared memory without the host's IPC
    // namespace, no capabilities, and no way to gain privileges.
    '--shm-size=1g',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--name',
    i.name,
    '--label',
    `${PID_LABEL}=${process.pid}`,
    ...(i.user ? ['--user', `${i.user.uid}:${i.user.gid}`, '-e', 'HOME=/tmp'] : []),
    // The project is read-only; only the output directory is writable.
    ...bindMount(i.root, '/work', true),
    ...bindMount(join(i.root, '.design-spine'), '/work/.design-spine'),
    ...i.cli.mounts,
    '-w',
    '/work',
    ...(i.hostNetwork ? ['--network', 'host'] : ['--add-host=host.docker.internal:host-gateway']),
    '-e',
    'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright',
    '-e',
    'SPINE_CWD=/work',
    // The run keeps the URL the host used, so review and reports read the same as a host capture.
    '-e',
    `SPINE_RECORDED_BASE_URL=${i.recordedBase}`,
    '-e',
    `SPINE_HOST_ROOT=${i.root}`,
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
  const listed = spawnSync('docker', ['images', IMAGE_REPO, '--format', '{{.Tag}}'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  for (const old of supersededImages(listed.status === 0 ? listed.stdout : '', tag)) {
    // No --force: an image a running container still uses stays.
    if (docker(['image', 'rm', old], { quiet: true }).status === 0) log(`Removed superseded ${old}`)
  }
  return tag
}

/**
 * Images for the same Playwright and Bun versions built from an older recipe. Each holds about
 * 2.6 GB that nothing will use again once the current recipe is built. Images for other versions
 * stay: another project may still pin them.
 */
export function supersededImages(tagRows: string, current: string): string[] {
  const tag = current.slice(IMAGE_REPO.length + 1)
  const versions = tag.slice(0, tag.lastIndexOf('-'))
  return tagRows
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row !== tag && (row === versions || row.startsWith(`${versions}-`)))
    .filter((row) => /^[0-9a-f]{12}$/.test(row.slice(versions.length + 1)) || row === versions)
    .map((row) => `${IMAGE_REPO}:${row}`)
}

export interface DockerCapture extends InnerCapture {
  root: string
  /** Base URL as the host sees it, before the loopback rewrite. */
  hostBase: string
  log: (s: string) => void
}

/**
 * Create `<root>/.design-spine` for the writable mount and refuse anything that is not a plain
 * directory there. Docker resolves a bind source on the host, so a symlink committed in a cloned
 * project would otherwise mount its target, anywhere on the host, writable inside the container.
 */
export function outputDir(root: string): string {
  const dir = join(root, '.design-spine')
  try {
    mkdirSync(dir)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
  }
  const stat = lstatSync(dir)
  if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(dir) !== dir)
    throw new Error(
      `${dir} must be a plain directory, not a symlink: --docker mounts it writable into the container`,
    )
  return dir
}

/** Runs `spine capture` inside the pinned Playwright image and resolves to its exit code. */
export async function captureInDocker(o: DockerCapture): Promise<number> {
  assertDockerReady()
  const image = ensureImage(installedPlaywrightVersion(), o.log)
  const cliFile = realpathSync(fileURLToPath(new URL('../cli.ts', import.meta.url)))
  const root = realpathSync(o.root)
  outputDir(root)
  const cli = locateCli(root, cliFile, dirname(dirname(cliFile)))
  const getuid = process.getuid?.()
  const linux = process.platform === 'linux'
  const name = `design-spine-capture-${process.pid}-${Date.now()}`
  const argv = dockerRunArgv({
    image,
    root,
    cli,
    name,
    recordedBase: o.hostBase,
    inner: innerCaptureArgs({ ...o, base: linux ? o.base : rewriteBaseForDocker(o.base) }),
    hostNetwork: linux,
    user:
      linux && getuid !== undefined
        ? { uid: getuid, gid: process.getgid?.() ?? getuid }
        : undefined,
  })
  // A capture killed with SIGKILL cannot clean up; its container is removed by the next run.
  for (const stale of staleContainers(listCaptureContainers(), processAlive)) removeContainer(stale)
  const remove = (): void => removeContainer(name)
  const signals = [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const
  const onSignal = signals.map(([signal, code]) => {
    const handler = (): never => process.exit(code)
    process.once(signal, handler)
    return [signal, handler] as const
  })
  // Signal handlers exit through process.exit, which fires this, so the container never outlives
  // the CLI that started it.
  process.on('exit', remove)
  try {
    return await new Promise<number>((done, fail) => {
      const child = spawn('docker', argv, { stdio: 'inherit' })
      child.on('error', fail)
      child.on('close', (code) => done(code ?? 1))
    })
  } finally {
    process.off('exit', remove)
    for (const [signal, handler] of onSignal) process.off(signal, handler)
  }
}

const PID_LABEL = 'design-spine.pid'

// Silent: --rm may already have removed the container.
const removeContainer = (name: string): void => {
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' })
}

function listCaptureContainers(): string {
  const listed = spawnSync(
    'docker',
    [
      'ps',
      '-a',
      '--filter',
      `label=${PID_LABEL}`,
      '--format',
      `{{.Names}}\t{{.Label "${PID_LABEL}"}}`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
  return listed.status === 0 ? listed.stdout : ''
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    // EPERM means the process exists under another user.
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Names of capture containers, from `docker ps` rows of name and pid, whose CLI has exited. */
export function staleContainers(rows: string, alive: (pid: number) => boolean): string[] {
  return rows
    .split('\n')
    .map((row) => row.split('\t'))
    .filter(([name, pid]) => name && /^\d+$/.test(pid ?? '') && !alive(Number(pid)))
    .map(([name]) => name as string)
}

/** Manifest path relative to the project root, since the container sees the root as /work. */
export function manifestInRoot(root: string, manifest: string): string {
  const rel = relative(root, resolve(root, manifest))
  if (!rel || rel.startsWith('..') || isAbsolute(rel))
    throw new Error('--docker needs the manifest inside the project root.')
  return rel.split(sep).join('/')
}
