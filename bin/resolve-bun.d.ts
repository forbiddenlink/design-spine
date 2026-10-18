export const MIN_MAJOR: number
export const MIN_MINOR: number
export function satisfiesMinimum(versionText: string): boolean
export function platformPackage(target: {
  platform: string
  arch: string
  musl?: boolean
}): string | undefined
export function bundledBunPath(options?: {
  platform?: string
  arch?: string
  musl?: boolean
  resolve?: (id: string) => string
  exists?: (path: string) => boolean
}): string | undefined
export function resolveBun(options?: {
  run?: (
    command: string,
    args: string[],
    options: { encoding: 'utf8' },
  ) => { error?: Error; status: number | null; stdout?: string | null }
  bundled?: () => string | undefined
}): string | undefined
