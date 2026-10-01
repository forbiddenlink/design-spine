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
}

export interface RunRecord {
  id: string
  startedAt: string
  finishedAt: string
  baseUrl: string
  tiles: Tile[]
}

export type Decision = 'approve' | 'reject'

export interface ReviewEntry {
  decision: Decision | null
  note: string
  updatedAt: string
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
