import { spawn } from 'node:child_process'
import { redactUrls } from './redact.ts'

/**
 * Start the app for a capture: run `command` through the shell in `cwd`, wait until something
 * answers at `baseUrl`, and stop the whole process group when this process exits, whatever the
 * exit path. Output is kept, not shown, and its tail is quoted if the app never answers or dies.
 */
export async function startApp(
  command: string,
  baseUrl: string,
  cwd: string,
  timeoutMs = 120_000,
  log: (line: string) => void = console.log,
): Promise<() => void> {
  const child = spawn(command, {
    cwd,
    shell: true,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // Never let the app keep this CLI alive; stop() and the exit hook end it.
  child.unref()
  let output = ''
  const keep = (chunk: Buffer): void => {
    output = (output + String(chunk)).slice(-4000)
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  let exited: number | null = null
  child.on('exit', (code) => {
    exited = code ?? -1
  })
  const stop = (): void => {
    if (exited !== null || !child.pid) return
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
  process.on('exit', stop)
  const tail = (): string => {
    const lines = output.trim().split('\n').slice(-8).join('\n')
    return lines ? `\nLast output:\n${redactUrls(lines)}` : ''
  }
  log(`Starting \`${command}\` and waiting for ${redactUrls(baseUrl)}`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (exited !== null)
      throw new Error(
        `\`${command}\` exited with code ${exited} before ${redactUrls(baseUrl)} answered.${tail()}`,
      )
    try {
      await fetch(baseUrl, { redirect: 'manual', signal: AbortSignal.timeout(2000) })
      return stop
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  stop()
  throw new Error(
    `Nothing answered at ${redactUrls(baseUrl)} within ${Math.round(timeoutMs / 1000)} s of starting \`${command}\`.${tail()}`,
  )
}
