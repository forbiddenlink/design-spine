export type ThemeMethod = 'localStorage' | 'class' | 'media'

export interface ThemesConfig {
  light: string
  dark: string
  method: ThemeMethod
  key?: string
}

export interface StateDef {
  name: string
  storageState?: string
  query?: string
  setup?: string
  todo?: boolean
  exclude?: string
  ready?: { selector: string; timeoutMs?: number }
  steps?: CaptureStep[]
  responses?: { url: string; status: number; body?: string; contentType?: string }[]
  masks?: { selector: string; reason: string }[]
}

export type CaptureStep =
  | { action: 'click' | 'hover' | 'wait'; selector: string; timeoutMs?: number }
  | { action: 'fill'; selector: string; value: string; timeoutMs?: number }
  | { action: 'press'; selector: string; key: string; timeoutMs?: number }

export interface CapturePolicy {
  accessibility?: boolean
  animations?: 'allow' | 'disabled'
  clock?: string
  stabilityAttempts?: number
  timeoutMs?: number
}

export interface RouteDef {
  path: string
  params?: Record<string, string>
  states: StateDef[]
}

export interface Manifest {
  baseUrl: string
  viewports: number[]
  themes: ThemesConfig
  initScripts?: { localStorage: Record<string, string> }[]
  routes: RouteDef[]
  capture?: CapturePolicy
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Tile {
  id: string
  file: string
  route: string
  path: string
  state: string
  viewport: number
  theme: 'light' | 'dark'
  status: number
  consoleErrors: string[]
  pageErrors: string[]
  overflowX: boolean
  blankRegions: { count: number; boxes: Box[] }
  brokenImages: string[]
  textClipped: { selector: string; text: string }[]
  /** Final path when navigation redirected (e.g. a gated route bouncing to /login). */
  redirectedTo?: string
  /** Non-fatal capture notes, such as a page that never went network-idle. */
  warnings?: string[]
  error?: string
  recipeHash?: string
  imageHash?: string
  stability?: 'stable' | 'unstable'
  masks?: { selector: string; reason: string; boxes: Box[] }[]
  accessibility?: {
    engine: string
    violations: { id: string; impact: string | null; help: string; targets: string[] }[]
    error?: string
  }
  diagnostic?: { stage: string; message: string }
}

export interface CoverageEntry {
  id: string
  route: string
  state: string
  viewport: number
  theme: 'light' | 'dark'
  outcome: 'planned' | 'captured' | 'failed' | 'skipped' | 'excluded' | 'filtered'
  reason?: string
  /** Legacy: runs before `filtered` recorded route-filter omissions as `excluded`. */
  exclusionSource?: 'manifest' | 'route-filter'
}

export interface Provenance {
  commit: string | null
  dirty: boolean | null
  browser: string
  runtime: string
  platform: string
  manifestHash: string
  policy: CapturePolicy
}

export interface RunRecord {
  id: string
  startedAt: string
  finishedAt: string
  baseUrl: string
  tiles: Tile[]
  schemaVersion?: 2
  coverage?: CoverageEntry[]
  provenance?: Provenance
}

export type Decision = 'approve' | 'reject'

export interface ReviewEntry {
  decision: Decision | null
  note: string
  updatedAt: string
  anchor?: { x: number; y: number; imageHash: string }
}

export interface ReviewFile {
  tiles: Record<string, ReviewEntry>
}

export interface CritiqueIssue {
  severity: string
  what: string
  where: string
}

export interface CritiqueEntry {
  verdict: 'pass' | 'fix' | 'error'
  issues: CritiqueIssue[]
  error?: string
}

export interface CritiqueFile {
  model: string
  tiles: Record<string, CritiqueEntry>
}
