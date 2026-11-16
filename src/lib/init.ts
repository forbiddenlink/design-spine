export type PackageManager = 'pnpm' | 'bun' | 'yarn' | 'npm'

/** Package manager from the lockfiles present in a directory; npm when none is found. */
export function packageManagerFor(files: readonly string[]): PackageManager {
  if (files.includes('pnpm-lock.yaml')) return 'pnpm'
  if (files.includes('bun.lock') || files.includes('bun.lockb')) return 'bun'
  if (files.includes('yarn.lock')) return 'yarn'
  return 'npm'
}

/**
 * The shell command that starts the app: the `dev` script, else `start`, run with the package
 * manager the lockfile implies. Undefined when package.json has neither.
 */
export function detectStartCommand(
  scripts: Record<string, unknown> | undefined,
  files: readonly string[],
): string | undefined {
  const name = ['dev', 'start'].find((key) => typeof scripts?.[key] === 'string')
  return name ? `${packageManagerFor(files)} run ${name}` : undefined
}
