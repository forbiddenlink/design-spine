import { Worker } from 'node:worker_threads'
for (const path of ['file:///$bunfs/root/comparison-worker.ts','file:///$bunfs/root/lib/comparison-worker.ts','file:///$bunfs/root/src/lib/comparison-worker.ts','file:///$bunfs/root/src/lib/comparison-worker.js','file:///$bunfs/root/lib/comparison-worker.js']) {
 await new Promise<void>(resolve => {
  const worker = new Worker(new URL(path))
  worker.on('error', error => { console.log(path, error.message); resolve() })
  worker.on('message', message => { console.log(path, message); worker.terminate(); resolve() })
  worker.postMessage({ runDir: '/missing', run: { tiles: [] } })
 })
}
