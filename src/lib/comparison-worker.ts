import { parentPort } from 'node:worker_threads'
import { comparisonSteps } from './comparison.ts'
import type { RunRecord } from './types.ts'

parentPort?.on('message', async ({ runDir, run }: { runDir: string; run: RunRecord }) => {
  try {
    let completed = 0
    const steps = comparisonSteps(runDir, run)
    let step = steps.next()
    while (!step.done) {
      step = steps.next()
      if (++completed % 4 === 0) {
        // Yield so temporary native buffers can be released during a large run.
        await new Promise<void>((resolve) => setImmediate(resolve))
        if (typeof Bun !== 'undefined') Bun.gc(true)
      }
    }
    const snapshot = step.value
    // Release decoded native-size buffers before the next queued job, off the server thread.
    if (typeof Bun !== 'undefined') Bun.gc(true)
    parentPort?.postMessage({ snapshot })
  } catch (error) {
    parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
})
