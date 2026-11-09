import { describe, expect, it } from 'vitest'
import { redactUrls, safeUrl } from '../src/lib/redact'

describe('safeUrl', () => {
  it.each([
    ['https://cdn.test/a.png?X-Amz-Signature=abc#f', 'https://cdn.test/a.png'],
    ['http://user:pw@127.0.0.1:3000/x?token=1', 'http://127.0.0.1:3000/x'],
    ['ws://127.0.0.1:3000/hmr?token=1', 'ws://127.0.0.1:3000/hmr'],
    ['data:image/png;base64,AAAA', 'data:[redacted]'],
    ['not a url', '[unparseable url]'],
  ])('%s -> %s', (from, to) => expect(safeUrl(from)).toBe(to))
})

describe('redactUrls', () => {
  it('strips query, hash and userinfo from every URL in free text', () => {
    expect(
      redactUrls(
        'Failed to load http://127.0.0.1:1/?token=SECRET and https://a:b@x.test/p#k, then retry',
      ),
    ).toBe('Failed to load http://127.0.0.1:1/ and https://x.test/p, then retry')
  })
  // Chrome logs failed sockets with the full URL, and socket auth often rides in the query.
  it('strips the query from WebSocket URLs too', () => {
    expect(redactUrls("WebSocket connection to 'wss://rt.test/socket?token=SECRET' failed")).toBe(
      "WebSocket connection to 'wss://rt.test/socket' failed",
    )
  })
  it('keeps text without URLs unchanged', () => {
    expect(redactUrls('TypeError: x is undefined')).toBe('TypeError: x is undefined')
  })
  it('keeps trailing sentence punctuation outside the URL', () => {
    expect(redactUrls('see https://x.test/a?q=1.')).toBe('see https://x.test/a.')
  })
})
