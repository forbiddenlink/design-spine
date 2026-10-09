import { Worker } from 'node:worker_threads'
console.log('META', import.meta.url, Bun.embeddedFiles.map(f => f.name))
const worker = new Worker('./src/lib/comparison-worker.ts')
worker.on('error', console.error)
worker.on('message', console.log)
worker.postMessage({ runDir: '/missing', run: { tiles: [] } })
setTimeout(() => worker.terminate(), 1000)
