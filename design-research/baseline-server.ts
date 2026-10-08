// Isolated original UI for before/after audits. GET-only proxy to fixture evidence.
const server = Bun.serve({
  port: 14748,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method !== 'GET') return new Response('Read-only baseline', { status: 405 })
    if (url.pathname === '/') return new Response(Bun.file(new URL('./baseline-ui.html', import.meta.url)))
    if (url.pathname === '/api/run' || url.pathname.startsWith('/img/')) return fetch('http://localhost:14747' + url.pathname)
    return new Response('Not found', { status: 404 })
  },
})
console.log(`Original review interface: http://localhost:${server.port}`)
