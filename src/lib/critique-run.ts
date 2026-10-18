import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { assertClaudeModel, buildPrompt, parseCritique } from './critique.ts'
import { loadCritique, writeJson } from './runs.ts'
import type { CritiqueEntry, CritiqueFile, Tile } from './types.ts'

export function resolveClaudeBin(bin: string): string {
  // Absolute, because claude runs from a temp cwd where a relative path would not resolve.
  const found = bin.includes('/') ? (Bun.file(bin).size ? resolve(bin) : null) : Bun.which(bin)
  if (!found) {
    throw new Error(
      `Claude Code CLI not found ("${bin}"). Install it or pass --claude-bin /path/to/claude. Critique needs the Claude CLI.`,
    )
  }
  return found
}

async function critiqueOne(
  bin: string,
  model: string,
  rules: string,
  runDir: string,
  t: Tile,
  timeoutMs: number,
): Promise<CritiqueEntry> {
  // Absolute: claude runs from a temp cwd, so a relative run dir would point nowhere.
  const image = resolve(runDir, t.file)
  const prompt = buildPrompt(
    rules,
    image,
    // The query can carry tokens; the critique only needs the route.
    `route ${(t.path ?? '').split('?')[0]}, state ${t.state}, ${t.viewport}px wide, ${t.theme} theme`,
  )
  const cwd = mkdtempSync(join(tmpdir(), 'spine-critique-'))
  try {
    return await spawnCritique(bin, model, image, prompt, cwd, timeoutMs)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

async function spawnCritique(
  bin: string,
  model: string,
  image: string,
  prompt: string,
  cwd: string,
  timeoutMs: number,
): Promise<CritiqueEntry> {
  const proc = Bun.spawn(
    [
      bin,
      '-p',
      '--output-format',
      'json',
      '--model',
      model,
      '--no-session-persistence',
      '--allowedTools',
      'Read',
      '--add-dir',
      dirname(image),
      // The target repo's own hooks, settings and MCP servers must not run here.
      '--setting-sources',
      'user',
      '--strict-mcp-config',
    ],
    // Own process group, so a timeout can kill claude and anything it started.
    {
      cwd,
      stdin: new TextEncoder().encode(prompt),
      stdout: 'pipe',
      stderr: 'pipe',
      detached: true,
    },
  )
  // Race the whole read: a killed child's own children can hold stdout open forever.
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<null>((done) => {
    timer = setTimeout(() => done(null), timeoutMs)
  })
  const finished = await Promise.race([
    Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]),
    timedOut,
  ])
  clearTimeout(timer)
  if (!finished) {
    try {
      process.kill(-proc.pid, 'SIGKILL')
    } catch {
      proc.kill('SIGKILL')
    }
    return { verdict: 'error', issues: [], error: `claude timed out after ${timeoutMs / 1000}s` }
  }
  const [out, err, code] = finished
  if (code !== 0)
    return { verdict: 'error', issues: [], error: `claude exited ${code}: ${err.slice(0, 200)}` }
  let text = out
  try {
    const env = JSON.parse(out) as { result?: string; is_error?: boolean }
    if (env.is_error)
      return { verdict: 'error', issues: [], error: String(env.result).slice(0, 200) }
    text = env.result ?? out
  } catch {
    // not an envelope; parse raw
  }
  return (
    parseCritique(text) ?? {
      verdict: 'error',
      issues: [],
      error: `unparseable reply: ${text.slice(0, 120)}`,
    }
  )
}

export async function runCritique(opts: {
  runDir: string
  tiles: Tile[]
  bin: string
  model: string
  rules: string
  parallel?: number
  timeoutMs?: number
  log?: (s: string) => void
}): Promise<CritiqueFile> {
  assertClaudeModel(opts.model)
  const bin = resolveClaudeBin(opts.bin)
  const file: CritiqueFile = loadCritique(opts.runDir) ?? { model: opts.model, tiles: {} }
  file.model = opts.model
  let next = 0
  let done = 0
  const worker = async (): Promise<void> => {
    while (next < opts.tiles.length) {
      const t = opts.tiles[next++] as Tile
      file.tiles[t.id] = await critiqueOne(
        bin,
        opts.model,
        opts.rules,
        opts.runDir,
        t,
        opts.timeoutMs ?? 300_000,
      )
      writeJson(join(opts.runDir, 'critique.json'), file)
      opts.log?.(`[${++done}/${opts.tiles.length}] ${t.id}: ${file.tiles[t.id]?.verdict}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.parallel ?? 2, 2) }, worker))
  return file
}
