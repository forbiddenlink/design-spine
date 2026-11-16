import { resolve } from 'node:path'

export const root = resolve(process.env.SPINE_CWD ?? process.cwd())
export const fail = (msg: string): never => {
  console.error(`spine: ${msg}`)
  process.exit(2)
}
export function numberOption(
  value: string,
  name: string,
  min: number,
  max = Infinity,
  integer = true,
): number {
  const number = Number(value)
  if (
    !value.trim() ||
    !Number.isFinite(number) ||
    number < min ||
    number > max ||
    (integer && !Number.isInteger(number))
  ) {
    throw new Error(
      `--${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max === Infinity ? 'a finite maximum' : max}.`,
    )
  }
  return number
}

export const guard =
  <A extends unknown[]>(fn: (...a: A) => Promise<void> | void) =>
  async (...a: A): Promise<void> => {
    try {
      await fn(...a)
    } catch (e) {
      fail((e as Error).message)
    }
  }
