import { dirname, join } from 'node:path'
import { assertClaudeModel, buildPrompt, parseCritique } from './critique.ts'
import { loadCritique, writeJson } from './runs.ts'
import type { CritiqueEntry, CritiqueFile, Tile } from './types.ts'

export function resolveClaudeBin(bin: string): string {
  const found = bin.includes('/') ? (Bun.file(bin).size ? bin : null) : Bun.which(bin)
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
): Promise<CritiqueEntry> {
  const image = join(runDir, t.file)
  const prompt = buildPrompt(
    rules,
    image,
    `route ${t.path}, state ${t.state}, ${t.viewport}px wide, ${t.theme} theme`,
  )
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
    ],
    { stdin: new TextEncoder().encode(prompt), stdout: 'pipe', stderr: 'pipe' },
  )
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
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
      file.tiles[t.id] = await critiqueOne(bin, opts.model, opts.rules, opts.runDir, t)
      writeJson(join(opts.runDir, 'critique.json'), file)
      opts.log?.(`[${++done}/${opts.tiles.length}] ${t.id}: ${file.tiles[t.id]?.verdict}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.parallel ?? 2, 2) }, worker))
  return file
}
