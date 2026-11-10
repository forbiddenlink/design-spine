/** Accessibility-tree snapshots sit beside each screenshot: `home__ideal__390__light.aria.yml`. */
export const ariaFileFor = (png: string): string => png.replace(/\.png$/, '.aria.yml')

/**
 * Lines removed (`- `) and added (`+ `) between two snapshots, in order, via a longest common
 * subsequence. Snapshots are a few hundred lines; past `maxLines` on either side the result is a
 * single note rather than an O(n*m) table.
 */
export function ariaLineDiff(before: string, after: string, maxLines = 3000): string[] {
  const a = before.replace(/\r\n/g, '\n').trimEnd().split('\n')
  const b = after.replace(/\r\n/g, '\n').trimEnd().split('\n')
  if (a.join('\n') === b.join('\n')) return []
  if (a.length > maxLines || b.length > maxLines)
    return [`~ snapshots differ (${a.length} and ${b.length} lines; too long to list)`]
  const n = a.length
  const m = b.length
  const w = m + 1
  const lcs = new Uint32Array((n + 1) * w)
  const at = (i: number, j: number): number => lcs[i * w + j] ?? 0
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
  const out: string[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (at(i + 1, j) >= at(i, j + 1)) out.push(`- ${a[i++]}`)
    else out.push(`+ ${b[j++]}`)
  }
  while (i < n) out.push(`- ${a[i++]}`)
  while (j < m) out.push(`+ ${b[j++]}`)
  return out
}
