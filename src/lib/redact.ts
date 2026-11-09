// Captured text lands in run.json, the HTML report and CI artifacts, so app-generated URLs keep
// only origin and path: query strings, fragments and userinfo often carry tokens or signatures.

/** One URL reduced to origin + path; non-HTTP schemes keep only the scheme. */
export function safeUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return '[unparseable url]'
  }
  return ['http:', 'https:'].includes(url.protocol)
    ? url.origin + url.pathname
    : `${url.protocol}[redacted]`
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>`]+/g
const TRAILING = /[.,;:!?)\]]+$/

/** Every http(s) URL inside free text (console messages, error strings) passed through safeUrl. */
export function redactUrls(text: string): string {
  return text.replace(URL_IN_TEXT, (match) => {
    const tail = match.match(TRAILING)?.[0] ?? ''
    return safeUrl(match.slice(0, match.length - tail.length)) + tail
  })
}
