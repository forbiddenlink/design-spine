import { parentPort } from 'node:worker_threads'
import { buildComparison } from './comparison.ts'
import type { RunRecord } from './types.ts'

parentPort?.on('message', ({ runDir, run }: { runDir: string; run: RunRecord }) => {
  try {
    const snapshot = buildComparison(runDir, run)
    // Release decoded native-size buffers before the next queued job, off the server thread.
    if (typeof Bun !== 'undefined') Bun.gc(true)
    parentPort?.postMessage({ snapshot })
  } catch (error) {
    parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
})
