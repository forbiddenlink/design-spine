import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Manifest } from './types.ts'

type ObjectValue = Record<string, unknown>
function object(value: unknown, path: string, keys: string[]): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`manifest ${path}: expected an object`)
  }
  const obj = value as ObjectValue
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) throw new Error(`manifest ${path}.${key}: unknown option`)
  }
  return obj
}
function string(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`manifest ${path}: expected a non-empty string`)
  }
}
function integer(value: unknown, path: string, min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`manifest ${path}: expected an integer ${min}–${max}`)
  }
}
function list(value: unknown, path: string, nonempty = true): unknown[] {
  if (!Array.isArray(value) || (nonempty && !value.length)) {
    throw new Error(`manifest ${path}: expected ${nonempty ? 'a non-empty' : 'an'} array`)
  }
  return value
}
function timeout(obj: ObjectValue, path: string): void {
  if (obj.timeoutMs !== undefined) integer(obj.timeoutMs, `${path}.timeoutMs`, 1, 30000)
}

/** Validate structure without exposing session contents or executing setup prose. */
export function validateManifest(value: unknown, root?: string): Manifest {
  const m = object(value, '', [
    'baseUrl',
    'viewports',
    'themes',
    'initScripts',
    'routes',
    'capture',
  ])
  string(m.baseUrl, 'baseUrl')
  try {
    const url = new URL(m.baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw 0
  } catch {
    throw new Error('manifest baseUrl: expected an HTTP(S) URL without credentials')
  }
  const widths = list(m.viewports, 'viewports')
  for (const width of widths) integer(width, 'viewports', 1, 8192)
  if (new Set(widths).size !== widths.length)
    throw new Error('manifest viewports: duplicate widths')
  const theme = object(m.themes, 'themes', ['light', 'dark', 'method', 'key'])
  string(theme.light, 'themes.light')
  string(theme.dark, 'themes.dark')
  if (
    typeof theme.method !== 'string' ||
    !['media', 'class', 'localStorage'].includes(theme.method)
  ) {
    throw new Error('manifest themes.method: expected media, class or localStorage')
  }
  if (theme.key !== undefined) string(theme.key, 'themes.key')
  if (m.initScripts !== undefined) {
    for (const item of list(m.initScripts, 'initScripts', false)) {
      const script = object(item, 'initScripts', ['localStorage'])
      if (
        !script.localStorage ||
        typeof script.localStorage !== 'object' ||
        Array.isArray(script.localStorage)
      ) {
        throw new Error('manifest initScripts.localStorage: expected an object')
      }
      for (const val of Object.values(script.localStorage)) {
        if (typeof val !== 'string')
          throw new Error('manifest initScripts.localStorage: expected string values')
      }
    }
  }
  if (m.capture !== undefined) {
    const policy = object(m.capture, 'capture', [
      'animations',
      'clock',
      'stabilityAttempts',
      'timeoutMs',
      'accessibility',
    ])
    if (policy.accessibility !== undefined && typeof policy.accessibility !== 'boolean')
      throw new Error('manifest capture.accessibility: expected boolean')
    if (
      policy.animations !== undefined &&
      (typeof policy.animations !== 'string' || !['allow', 'disabled'].includes(policy.animations))
    ) {
      throw new Error('manifest capture.animations: expected allow or disabled')
    }
    if (policy.clock !== undefined) {
      string(policy.clock, 'capture.clock')
      if (!Number.isFinite(Date.parse(policy.clock)))
        throw new Error('manifest capture.clock: invalid date')
    }
    if (policy.stabilityAttempts !== undefined)
      integer(policy.stabilityAttempts, 'capture.stabilityAttempts', 2, 10)
    timeout(policy, 'capture')
  }
  for (const [ri, rawRoute] of list(m.routes, 'routes').entries()) {
    const path = `routes[${ri}]`
    const route = object(rawRoute, path, ['path', 'params', 'states'])
    string(route.path, `${path}.path`)
    if (!route.path.startsWith('/') || route.path.startsWith('//') || /[?#\\]/.test(route.path)) {
      throw new Error(`manifest ${path}.path: expected a local route path without query or hash`)
    }
    if (route.params !== undefined) {
      if (!route.params || typeof route.params !== 'object' || Array.isArray(route.params)) {
        throw new Error(`manifest ${path}.params: expected an object`)
      }
      for (const v of Object.values(route.params)) string(v, `${path}.params`)
    }
    for (const [si, rawState] of list(route.states, `${path}.states`).entries()) {
      const sp = `${path}.states[${si}]`
      const state = object(rawState, sp, [
        'name',
        'storageState',
        'query',
        'setup',
        'todo',
        'exclude',
        'ready',
        'steps',
        'responses',
        'masks',
      ])
      string(state.name, `${sp}.name`)
      for (const key of ['storageState', 'query', 'setup', 'exclude']) {
        if (state[key] !== undefined) string(state[key], `${sp}.${key}`)
      }
      if (state.todo !== undefined && typeof state.todo !== 'boolean')
        throw new Error(`manifest ${sp}.todo: expected boolean`)
      if (root && state.storageState && !state.todo && !state.exclude) {
        const file = join(root, String(state.storageState))
        if (!existsSync(file) || !statSync(file).isFile())
          throw new Error(`manifest ${sp}.storageState: file missing`)
      }
      if (state.ready !== undefined) {
        const ready = object(state.ready, `${sp}.ready`, ['selector', 'timeoutMs'])
        string(ready.selector, `${sp}.ready.selector`)
        timeout(ready, `${sp}.ready`)
      }
      if (state.steps !== undefined) {
        const steps = list(state.steps, `${sp}.steps`, false)
        if (steps.length > 50) throw new Error(`manifest ${sp}.steps: maximum 50 operations`)
        for (const step of steps) {
          const s = object(step, `${sp}.steps`, ['action', 'selector', 'value', 'key', 'timeoutMs'])
          if (
            typeof s.action !== 'string' ||
            !['click', 'hover', 'wait', 'fill', 'press'].includes(s.action)
          )
            throw new Error(`manifest ${sp}.steps.action: unsupported operation`)
          string(s.selector, `${sp}.steps.selector`)
          if (s.action === 'fill' && typeof s.value !== 'string')
            throw new Error(`manifest ${sp}.steps.value: expected string`)
          if (s.action === 'press') string(s.key, `${sp}.steps.key`)
          timeout(s, `${sp}.steps`)
        }
      }
      if (state.responses !== undefined) {
        for (const raw of list(state.responses, `${sp}.responses`, false)) {
          const response = object(raw, `${sp}.responses`, ['url', 'status', 'body', 'contentType'])
          string(response.url, `${sp}.responses.url`)
          integer(response.status, `${sp}.responses.status`, 200, 599)
          for (const key of ['body', 'contentType']) {
            if (response[key] !== undefined && typeof response[key] !== 'string')
              throw new Error(`manifest ${sp}.responses.${key}: expected string`)
          }
        }
      }
      if (state.masks !== undefined) {
        for (const raw of list(state.masks, `${sp}.masks`, false)) {
          const mask = object(raw, `${sp}.masks`, ['selector', 'reason'])
          string(mask.selector, `${sp}.masks.selector`)
          string(mask.reason, `${sp}.masks.reason`)
        }
      }
    }
  }
  return value as Manifest
}

/** Object-key order is irrelevant; array order remains part of capture behavior. */
export function fingerprint(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize)
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, value]) => value !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [key, normalize(value)]),
      )
    return item
  }
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex')
}
