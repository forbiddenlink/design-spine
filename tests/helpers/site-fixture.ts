import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'

export async function siteFixture(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const path = new URL(request.url || '/', 'http://localhost').pathname
    const file = path === '/' ? 'index.html' : path.slice(1)
    if (
      !['index.html', 'demo.js', 'demo.css'].includes(file) &&
      !/^frames\/[a-zA-Z0-9_.-]+\.webp$/.test(file)
    ) {
      response.writeHead(404).end()
      return
    }
    try {
      const body = readFileSync(resolve('site', file))
      response.setHeader(
        'Content-Type',
        file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : file.endsWith('.webp')
              ? 'image/webp'
              : 'text/html',
      )
      response.end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', done)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Site fixture did not start')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done()))),
  }
}
