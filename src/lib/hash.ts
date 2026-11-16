import { createHash } from 'node:crypto'

/** Hex SHA-256, the one hash every evidence check compares. */
export const sha256 = (data: Uint8Array | string): string =>
  createHash('sha256').update(data).digest('hex')
