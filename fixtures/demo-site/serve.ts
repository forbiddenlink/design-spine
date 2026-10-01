// Tiny static server for the smoke test: bun fixtures/demo-site/serve.ts [port]
const root = new URL('./public/', import.meta.url)
const port = Number(process.argv[2] ?? 4010)

Bun.serve({
  port,
  async fetch(req) {
    let p = new URL(req.url).pathname
    if (p === '/') p = '/index'
    const file = Bun.file(new URL(`.${p}.html`, root))
    return (await file.exists()) ? new Response(file) : new Response('not found', { status: 404 })
  },
})
console.log(`demo site on http://localhost:${port}`)
