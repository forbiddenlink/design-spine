const state = {
  run: null,
  review: {},
  critique: {},
  comparison: {},
  comparisonLoading: false,
  comparisonFailed: false,
  comparisonGeneration: 0,
  comparedAt: null,
  threshold: 0.002,
  onlyChanged: false,
  page: 0,
  pageSize: 48,
  viewerMode: 'current',
  onlyFlagged: false,
  onlyWarnings: false,
  onlyUnreviewed: false,
  search: '',
  status: '',
  evidence: '',
  viewport: '',
  theme: '',
  focus: null,
  drafts: new Map(),
  pending: new Map(),
  failures: new Map(),
  loading: true,
  viewer: null,
  returnFocus: null,
}
const selectedRun = () => new URL(location.href).searchParams.get('run')
const apiPath = (path) => {
  const url = new URL(path, location.origin)
  if (selectedRun()) url.searchParams.set('run', selectedRun())
  return url.pathname + url.search
}
const $ = (s) => document.querySelector(s)
const el = (tag, cls, text) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}
const decision = (t) => state.review[t.id]?.decision || null
/** No decision yet, but the capture is byte-identical to a baseline someone already approved. */
const matchesBaseline = (t) => !decision(t) && !!state.comparison[t.id]?.identical
/** Needs a person: no decision and nothing already approved stands for it. */
const awaiting = (t) => !decision(t) && !matchesBaseline(t)
const decisionLabel = (t) =>
  decision(t) === 'approve'
    ? 'Approved'
    : decision(t) === 'reject'
      ? 'Rejected'
      : matchesBaseline(t)
        ? 'Matches baseline'
        : 'Pending'
const comparisonLabels = {
  new: 'New · no baseline',
  changed: 'Changed',
  subtle: 'Subtle change · below color tolerance',
  'structure-changed': 'Accessibility tree changed · pixels match',
  unchanged: 'Within threshold',
  'size-changed': 'Dimensions changed',
  'no-capture': 'Comparison: no capture',
  unavailable: 'Comparison unavailable',
}

function flags(t) {
  const f = []
  if (t.accessibility?.error) f.push(t.accessibility.error)
  if (t.accessibility?.violations.length)
    f.push(`${t.accessibility.violations.length} automated accessibility findings`)
  if (t.stability === 'unstable') f.push('Capture did not stabilize')
  if (t.error) f.push(`Capture failed: ${t.error}`)
  if (t.status === 0 && !t.error) f.push('No response')
  if (t.expectedStatus) {
    if (t.status && t.status !== t.expectedStatus)
      f.push(`HTTP ${t.status}, expected ${t.expectedStatus}`)
  } else if (t.status >= 400) f.push(`HTTP ${t.status}`)
  if (t.overflowX)
    f.push(
      t.overflowOffenders?.[0]
        ? `Horizontal overflow from ${t.overflowOffenders[0].selector} (${t.overflowOffenders[0].cssWidth ?? t.overflowOffenders[0].box.w}px wide)`
        : 'Horizontal overflow',
    )
  if (t.blankRegions.count)
    f.push(`${t.blankRegions.count} blank region${t.blankRegions.count > 1 ? 's' : ''}`)
  if (t.brokenImages.length)
    f.push(`${t.brokenImages.length} broken image${t.brokenImages.length > 1 ? 's' : ''}`)
  if (t.consoleErrors.length)
    f.push(`${t.consoleErrors.length} console error${t.consoleErrors.length > 1 ? 's' : ''}`)
  if (t.pageErrors.length)
    f.push(`${t.pageErrors.length} page error${t.pageErrors.length > 1 ? 's' : ''}`)
  if (t.requestErrors?.length)
    f.push(`${t.requestErrors.length} failed request${t.requestErrors.length > 1 ? 's' : ''}`)
  if (t.redirectedTo) f.push(`Redirected to ${t.redirectedTo}`)
  return f
}
const isFlagged = (t) => flags(t).length > 0
/** Filters live in the URL so a reload or a shared link reopens the same review queue. */
const FILTER_PARAMS = [
  ['q', 'search'],
  ['status', 'status'],
  ['evidence', 'evidence'],
  ['width', 'viewport'],
  ['theme', 'theme'],
]
const TOGGLE_PARAMS = [
  ['flagged', 'onlyFlagged', '#f-flagged'],
  ['warnings', 'onlyWarnings', '#f-warnings'],
  ['changed', 'onlyChanged', '#f-changed'],
  ['unreviewed', 'onlyUnreviewed', '#f-unrev'],
]
function readFiltersFromUrl() {
  const params = new URL(location.href).searchParams
  for (const [param, key] of FILTER_PARAMS) state[key] = params.get(param) ?? ''
  state.search = state.search.trim().toLowerCase()
  for (const [param, key, button] of TOGGLE_PARAMS) {
    state[key] = params.get(param) === '1'
    $(button).setAttribute('aria-pressed', String(state[key]))
  }
  $('#search').value = state.search
  $('#status-filter').value = state.status
  $('#comparison-filter').value = state.evidence
  $('#theme-filter').value = state.theme
}
function writeFiltersToUrl() {
  const url = new URL(location.href)
  for (const [param, key] of FILTER_PARAMS)
    if (state[key]) url.searchParams.set(param, state[key])
    else url.searchParams.delete(param)
  for (const [param, key] of TOGGLE_PARAMS)
    if (state[key]) url.searchParams.set(param, '1')
    else url.searchParams.delete(param)
  if (url.href !== location.href) history.replaceState(null, '', url)
}
function visibleTiles() {
  const routeOrder = new Map(
    [...new Set((state.run?.tiles || []).map((t) => t.route))].map((route, index) => [
      route,
      index,
    ]),
  )
  return (state.run?.tiles || [])
    .filter(
      (t) =>
        (!state.onlyChanged ||
          ['new', 'changed', 'subtle', 'structure-changed', 'size-changed'].includes(
            state.comparison[t.id]?.status,
          )) &&
        (!state.onlyFlagged || isFlagged(t)) &&
        (!state.onlyWarnings || t.warnings?.length > 0) &&
        (!state.onlyUnreviewed || awaiting(t)) &&
        (!state.evidence || state.comparison[t.id]?.status === state.evidence) &&
        (!state.status || decision(t) === state.status) &&
        (!state.viewport || String(t.viewport) === state.viewport) &&
        (!state.theme || t.theme === state.theme) &&
        `${t.route} ${t.state}`.toLowerCase().includes(state.search),
    )
    .sort(
      (a, b) =>
        routeOrder.get(a.route) - routeOrder.get(b.route) ||
        a.state.localeCompare(b.state) ||
        a.viewport - b.viewport ||
        (a.theme === b.theme ? 0 : a.theme === 'light' ? -1 : 1),
    )
}
function showEmpty(title, text, action, callback) {
  const box = el('div', 'empty')
  box.append(el('h2', null, title), el('p', null, text))
  if (action) {
    const button = el('button', 'button', action)
    button.addEventListener('click', callback)
    box.append(button)
  }
  $('#cards').replaceChildren(box)
}
async function load() {
  state.loading = true
  state.run = null
  state.review = {}
  state.critique = {}
  state.comparison = {}
  $('#cards').setAttribute('aria-busy', 'true')
  $('#progress-label').textContent = 'Loading review progress'
  $('#percent').textContent = '…'
  updateControls()
  showEmpty('Loading your captures…', 'Reading this run’s screenshots and review decisions.')
  try {
    const response = await fetch(apiPath('/api/run?compare=false'))
    if (!response.ok) throw new Error(`The review server returned HTTP ${response.status}.`)
    const data = await response.json()
    if (!data.run || !Array.isArray(data.run.tiles))
      throw new Error('This run does not contain valid capture data.')
    state.comparison = data.comparison?.tiles || {}
    state.threshold = data.comparison?.threshold ?? 0.002
    state.run = data.run
    state.review = data.review?.tiles || {}
    state.critique = data.critique?.tiles || {}
    if (!selectedRun() && data.runKey) {
      const url = new URL(location.href)
      url.searchParams.set('run', data.runKey)
      history.replaceState(null, '', url)
    }
    renderCoverage()
    loadHistory()
    $('#runid').textContent = data.run.id
    $('#baseurl').textContent = data.run.baseUrl
    const nav = $('#route-nav')
    nav.replaceChildren()
    for (const [index, route] of [...new Set(data.run.tiles.map((t) => t.route))].entries()) {
      const link = el('a', null, route)
      link.href = `#route-${index}`
      link.dataset.route = route
      link.append(el('span'))
      link.addEventListener('click', (event) => {
        event.preventDefault()
        clearFilters()
        const position = visibleTiles().findIndex((t) => t.route === route)
        state.page = Math.floor(Math.max(0, position) / state.pageSize)
        render()
        const section = $(`#route-${index}`)
        if (section) {
          section.scrollIntoView({ block: 'start' })
          section.querySelector('h2').focus({ preventScroll: true })
        }
      })
      nav.append(link)
    }
    const select = $('#viewport-filter')
    select.replaceChildren(new Option('All widths', ''))
    for (const width of [...new Set(data.run.tiles.map((t) => t.viewport))].sort((a, b) => a - b))
      select.add(new Option(`${width}px`, String(width)))
    select.value = state.viewport
    if (select.value !== state.viewport) state.viewport = ''
    state.loading = false
    render()
    loadComparison(data.comparison)
    const linked = new URL(location.href).searchParams.get('tile')
    const linkedTile = data.run.tiles.find((t) => t.id === linked)
    if (linkedTile) openBox(linkedTile)
  } catch (error) {
    state.loading = false
    $('#runid').textContent = 'Run unavailable'
    $('#results').textContent = 'Unable to load captures'
    $('#progress-label').textContent = 'Review progress unavailable'
    $('#percent').textContent = 'n/a'
    showEmpty(
      'Could not load this run.',
      `${error.message} Check that the review server is running, then retry.`,
      'Retry loading',
      load,
    )
  } finally {
    $('#cards').setAttribute('aria-busy', 'false')
    updateControls()
  }
}
async function loadComparison(provided) {
  const generation = ++state.comparisonGeneration
  state.comparisonLoading = true
  state.comparisonFailed = false
  $('#comparison-status').textContent =
    'Comparing captures with local baselines… You can continue reviewing.'
  for (const label of document.querySelectorAll('.tile .comparison-status'))
    label.textContent = 'Comparing…'
  updateControls()
  try {
    let comparison = provided
    if (!comparison) {
      const response = await fetch(apiPath('/api/comparison'))
      if (!response.ok) throw new Error('Comparison unavailable')
      comparison = await response.json()
    }
    if (!comparison?.tiles || typeof comparison.threshold !== 'number')
      throw new Error('Invalid comparison evidence')
    if (generation !== state.comparisonGeneration) return
    state.comparison = comparison.tiles
    state.threshold = comparison.threshold
    state.comparedAt = comparison.comparedAt || null
    $('#comparison-status').textContent =
      'Comparison ready · threshold ' +
      (state.threshold * 100).toFixed(2) +
      '% · Baselines change only through the approve command.'
  } catch {
    if (generation !== state.comparisonGeneration) return
    state.comparisonFailed = true
    const box = $('#comparison-status')
    box.replaceChildren(
      el(
        'span',
        null,
        'Comparison could not load. Your captures and review notes are still available.',
      ),
    )
    const retry = el('button', 'button', 'Retry comparison')
    retry.addEventListener('click', () => loadComparison())
    box.append(retry)
  } finally {
    if (generation === state.comparisonGeneration) {
      state.comparisonLoading = false
      // Identical captures change pending counts and card labels, not only the filtered set.
      if (
        state.onlyChanged ||
        state.evidence ||
        Object.values(state.comparison).some((entry) => entry?.identical)
      )
        render()
      updateControls()
      for (const card of document.querySelectorAll('.tile'))
        card.querySelector('.comparison-status').textContent =
          comparisonLabels[state.comparison[card.dataset.id]?.status] ||
          (state.comparisonFailed ? 'Comparison unavailable' : 'Not compared')
      if ($('#lightbox').open) {
        if (viewerTiles().some((t) => t.id === state.viewer)) updateViewer()
        else $('#lightbox').close()
      }
    }
  }
}
function updateControls() {
  updateCoverageDecisions()
  const dirty = state.drafts.size || state.pending.size || state.failures.size
  for (const control of document.querySelectorAll(
    '.toolbar input, .toolbar select, .toolbar button',
  ))
    control.disabled = !state.run || state.loading
  $('#export').disabled = !state.run || state.loading || !!dirty || state.comparisonLoading
  $('#report').disabled = $('#export').disabled
  $('#run-select').disabled = !state.run || state.loading || !!dirty
  $('#f-changed').disabled =
    !state.run || state.loading || state.comparisonLoading || state.comparisonFailed
  $('#comparison-filter').disabled = $('#f-changed').disabled
  updateViewerControls()
  $('#export').title = state.comparisonLoading
    ? 'Waiting for comparison evidence.'
    : dirty
      ? 'Save or retry your changes before exporting.'
      : 'Download the full run and confirmed review decisions.'
  $('#next-pending').disabled = !visibleTiles().some(awaiting) || state.loading
}
async function loadHistory() {
  const select = $('#run-select')
  select.replaceChildren(new Option(state.run.id, selectedRun() || ''))
  try {
    const response = await fetch('/api/runs')
    if (!response.ok) return
    const runs = await response.json()
    if (!Array.isArray(runs)) return
    const current = selectedRun()
    select.replaceChildren()
    if (!current) select.add(new Option(`${state.run.id} · opened run`, ''))
    for (const run of runs) select.add(new Option(`${run.id} · ${run.tiles} captures`, run.id))
    select.value = current || ''
  } catch {
    /* The opened run remains available when history cannot load. */
  }
}
$('#run-select').addEventListener('change', () => {
  if (state.drafts.size || state.pending.size || state.failures.size) return
  const url = new URL(location.href)
  if ($('#run-select').value) url.searchParams.set('run', $('#run-select').value)
  else url.searchParams.delete('run')
  url.searchParams.delete('tile')
  history.replaceState(null, '', url)
  ++state.comparisonGeneration
  state.viewer = null
  state.focus = null
  clearFilters()
  load()
})
function renderCoverage() {
  const run = state.run
  const coverage = run.coverage
  const summary = $('#coverage-summary')
  const details = $('#coverage-details')
  details.replaceChildren()
  if (!coverage) {
    summary.textContent = 'Coverage unknown · legacy run'
    details.append(el('p', null, 'Recapture to record planned, skipped and excluded states.'))
  } else {
    const count = (outcome) => coverage.filter((entry) => entry.outcome === outcome).length
    const summaryText =
      count('captured') +
      ' of ' +
      coverage.length +
      ' planned tiles captured · ' +
      count('failed') +
      ' failed · ' +
      count('skipped') +
      ' unfinished · ' +
      count('excluded') +
      ' excluded' +
      (count('filtered') ? ` · ${count('filtered')} outside this capture’s route filter` : '')
    summary.replaceChildren(
      el('span', 'coverage-long', summaryText),
      el(
        'span',
        'coverage-short',
        `Coverage · ${count('captured')} of ${coverage.length} captured`,
      ),
    )
    const list = el('ul')
    for (const entry of coverage)
      list.append(
        el(
          'li',
          null,
          entry.route +
            ' · ' +
            entry.state +
            ' · ' +
            entry.viewport +
            'px · ' +
            entry.theme +
            ': ' +
            entry.outcome +
            (entry.reason ? `: ${entry.reason}` : ''),
        ),
      )
    details.append(list)
    const matrix = el('div', 'coverage-scroll')
    matrix.tabIndex = 0
    matrix.setAttribute('role', 'region')
    matrix.setAttribute('aria-label', 'Scrollable capture coverage')
    const table = el('table', 'coverage-matrix')
    table.id = 'coverage-matrix'
    table.append(el('caption', null, 'Capture coverage'))
    const columns = [
      ...new Map(
        coverage.map((entry) => [
          `${entry.viewport}:${entry.theme}`,
          { viewport: entry.viewport, theme: entry.theme },
        ]),
      ).values(),
    ].sort(
      (a, b) => a.viewport - b.viewport || (a.theme === b.theme ? 0 : a.theme === 'light' ? -1 : 1),
    )
    const head = el('thead')
    const headers = el('tr')
    const label = el('th', null, 'Route / state')
    label.scope = 'col'
    headers.append(label)
    for (const column of columns) {
      const header = el('th', null, `${column.viewport}px · ${column.theme}`)
      header.scope = 'col'
      headers.append(header)
    }
    head.append(headers)
    table.append(head)
    const groups = new Map()
    for (const entry of coverage) {
      const key = JSON.stringify([entry.route, entry.state])
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(entry)
    }
    const body = el('tbody')
    const tiles = new Map(run.tiles.map((tile) => [tile.id, tile]))
    const labels = {
      skipped: 'Unfinished',
      excluded: 'Excluded',
      filtered: 'Filtered out',
      failed: 'Failed',
      planned: 'Not captured',
    }
    for (const entries of groups.values()) {
      const row = el('tr')
      const label = el('th', null, `${entries[0].route} · ${entries[0].state}`)
      label.scope = 'row'
      row.append(label)
      for (const column of columns) {
        const entry = entries.find(
          (item) => item.viewport === column.viewport && item.theme === column.theme,
        )
        const cell = el('td')
        const tile = entry && tiles.get(entry.id)
        if (entry?.outcome === 'captured' && tile && !tile.error) {
          const button = el('button', 'coverage-cell')
          button.dataset.coverageTile = tile.id
          button.addEventListener('click', () => {
            clearFilters()
            focusTile(tile.id, false)
            openBox(tile, button)
          })
          cell.append(button)
        } else {
          cell.append(
            el(
              'span',
              'coverage-unavailable',
              !entry
                ? 'Not planned'
                : tile?.error
                  ? 'Failed'
                  : labels[entry.outcome] || 'Missing capture',
            ),
          )
          cell.title = tile?.error || entry?.reason || ''
        }
        row.append(cell)
      }
      body.append(row)
    }
    table.append(body)
    matrix.append(table)
    details.prepend(matrix)
    const inventory = el('details')
    inventory.append(el('summary', null, 'Coverage reasons and capture environment'))
    inventory.append(list)
    details.append(inventory)
  }
  ;(details.querySelector('details') || details).append(
    el(
      'pre',
      null,
      run.provenance ? JSON.stringify(run.provenance, null, 2) : 'Capture environment unknown.',
    ),
  )
}
function updateCoverageDecisions() {
  if (!state.run) return
  const tiles = new Map(state.run.tiles.map((tile) => [tile.id, tile]))
  for (const button of document.querySelectorAll('[data-coverage-tile]')) {
    const tile = tiles.get(button.dataset.coverageTile)
    if (!tile) continue
    const missing = state.comparison[tile.id]?.status === 'no-capture'
    const value = missing ? null : decision(tile)
    const label = missing
      ? 'Missing capture'
      : value === 'approve'
        ? 'Approved'
        : value === 'reject'
          ? 'Rejected'
          : 'Pending'
    const flagCount = missing ? 0 : flags(tile).length
    const flagText = flagCount ? ` · ${flagCount} flag${flagCount > 1 ? 's' : ''}` : ''
    button.textContent =
      (missing ? '' : value === 'approve' ? '✓ ' : value === 'reject' ? '× ' : '○ ') +
      label +
      flagText
    button.dataset.decision = missing ? 'missing' : value || 'pending'
    if (flagCount) button.dataset.flagged = String(flagCount)
    else delete button.dataset.flagged
    button.setAttribute(
      'aria-label',
      tile.route +
        ' · ' +
        tile.state +
        ' · ' +
        tile.viewport +
        'px · ' +
        tile.theme +
        ' · ' +
        label +
        flagText,
    )
    button.disabled = missing || state.pending.has(tile.id)
  }
}
$('#report').addEventListener('click', () => {
  if (!$('#report').disabled) location.href = apiPath('/api/report')
})
function renderStats() {
  const activeFilters = [
    state.status,
    state.evidence,
    state.viewport,
    state.theme,
    state.onlyFlagged,
    state.onlyWarnings,
    state.onlyChanged,
    state.onlyUnreviewed,
  ].filter(Boolean).length
  $('#toggle-filters').textContent = activeFilters ? `Filters (${activeFilters} active)` : 'Filters'
  const tiles = state.run.tiles
  const n = (fn) => tiles.filter(fn).length
  const stats = $('#stats')
  stats.replaceChildren()
  for (const [label, value] of [
    ['Captured', tiles.length],
    ['Flagged', n(isFlagged)],
    ['Approved', n((t) => decision(t) === 'approve')],
    ['Rejected', n((t) => decision(t) === 'reject')],
    ['Pending', n(awaiting)],
  ]) {
    const box = el('div', `stat ${label.toLowerCase()}`)
    box.append(el('b', null, String(value)), el('span', null, label))
    stats.append(box)
  }
  for (const link of document.querySelectorAll('#route-nav a')) {
    const routeTiles = tiles.filter((t) => t.route === link.dataset.route)
    link.querySelector('span').textContent =
      `${routeTiles.filter((t) => !awaiting(t)).length}/${routeTiles.length}`
  }
  const reviewed = n((t) => !awaiting(t))
  $('#progress').max = tiles.length || 1
  $('#progress').value = reviewed
  $('#progress-label').textContent =
    reviewed +
    ' of ' +
    tiles.length +
    ' reviewed' +
    (tiles.length && reviewed === tiles.length ? ' · Captured evidence reviewed' : '')
  $('#percent').textContent = `${tiles.length ? Math.round((reviewed / tiles.length) * 100) : 0}%`
  const matching = visibleTiles().length
  $('#results').textContent =
    matching <= state.pageSize
      ? `${matching} of ${tiles.length} captures shown`
      : `${matching} matching captures · ${tiles.length} total`
  updateControls()
}
function renderTile(t) {
  const d = decision(t)
  const card = el(
    'article',
    'tile' +
      (d === 'approve' ? ' approved' : d === 'reject' ? ' rejected' : '') +
      (state.focus === t.id ? ' focus' : ''),
  )
  const more = el('details', 'tile-more')
  const moreParts = []
  if (t.accessibility?.violations.length) {
    const details = el('details', 'diagnostics')
    details.append(el('summary', null, 'Automated accessibility findings'))
    const list = el('ul')
    for (const issue of t.accessibility.violations)
      list.append(el('li', null, `${issue.id}: ${issue.help} · ${issue.targets.join(', ')}`))
    details.append(list)
    more.append(details)
    moreParts.push(`${t.accessibility.violations.length} a11y`)
  }
  if (t.masks?.length) {
    const details = el('details', 'diagnostics')
    details.append(el('summary', null, `Comparison masks (${t.masks.length})`))
    const list = el('ul')
    for (const mask of t.masks)
      list.append(
        el(
          'li',
          null,
          mask.selector +
            ': ' +
            mask.reason +
            ' · ' +
            mask.boxes
              .map(
                (box) =>
                  Math.round(box.x) +
                  ',' +
                  Math.round(box.y) +
                  ' ' +
                  Math.round(box.w) +
                  '×' +
                  Math.round(box.h) +
                  'px',
              )
              .join('; '),
        ),
      )
    details.append(list)
    more.append(details)
    moreParts.push(`${t.masks.length} masks`)
  }
  card.dataset.id = t.id
  card.tabIndex = 0
  card.setAttribute(
    'aria-label',
    t.route +
      ', ' +
      t.state +
      ', ' +
      t.viewport +
      ' pixels, ' +
      t.theme +
      ', ' +
      decisionLabel(t).toLowerCase(),
  )
  const head = el('div', 'head')
  head.append(el('span', null, `${t.viewport}px · ${t.theme}`), el('span', null, decisionLabel(t)))
  const thumb = el('div', 'thumb')
  thumb.tabIndex = 0
  thumb.setAttribute('role', 'region')
  thumb.setAttribute('aria-label', `Screenshot preview for ${t.id}`)
  const inspect = el('button', 'button inspect', 'Inspect')
  inspect.setAttribute('aria-label', 'Inspect screenshot')
  inspect.disabled = !!t.error
  inspect.addEventListener('click', () => openBox(t, inspect))
  if (!t.error) {
    const img = el('img')
    img.loading = 'lazy'
    img.src = apiPath(`/img/${encodeURIComponent(t.file)}`)
    img.alt = `${t.route} · ${t.state} · ${t.viewport}px · ${t.theme}`
    img.addEventListener('click', () => openBox(t, inspect))
    img.addEventListener('error', () => {
      thumb.replaceChildren(
        el('p', 'capture-missing', 'Screenshot unavailable. Check this run’s capture files.'),
      )
      inspect.disabled = true
    })
    const frame = el('div', 'thumb-frame')
    frame.append(img)
    const boxes = (t.blankRegions?.boxes || []).filter(
      (b) => [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0,
    )
    if (boxes.length) {
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      overlay.setAttribute('class', 'thumb-evidence')
      overlay.setAttribute('aria-hidden', 'true')
      overlay.setAttribute('preserveAspectRatio', 'none')
      for (const box of boxes) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        for (const [name, value] of Object.entries({
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
        }))
          rect.setAttribute(name, value)
        overlay.append(rect)
      }
      const sizeOverlay = () => {
        if (img.naturalWidth)
          overlay.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`)
      }
      img.addEventListener('load', sizeOverlay)
      sizeOverlay()
      frame.append(overlay)
    }
    if (t.overflowX) thumb.classList.add('overflow-x')
    thumb.append(frame)
  } else
    thumb.append(
      el('p', 'capture-missing', 'No screenshot was captured. See the capture error below.'),
    )
  const badges = el('div', 'badges')
  const errors = flags(t)
  if (!errors.length && !t.textClipped.length && !t.warnings?.length)
    badges.append(el('span', 'badge ok', 'Checks clear'))
  for (const text of errors) badges.append(el('span', 'badge', text))
  if (t.textClipped.length)
    badges.append(
      el(
        'span',
        'badge warn',
        `${t.textClipped.length} clipped text warning${t.textClipped.length > 1 ? 's' : ''}`,
      ),
    )
  if (t.warnings?.length)
    badges.append(
      el(
        'span',
        'badge warn',
        `${t.warnings.length} capture warning${t.warnings.length > 1 ? 's' : ''}`,
      ),
    )
  card.append(head, thumb, badges)
  const diagnostics = [
    ...t.consoleErrors,
    ...t.pageErrors,
    ...(t.requestErrors || []).map(
      (error) =>
        'Request: ' +
        (error.status !== undefined ? `HTTP ${error.status}` : error.failure) +
        ' · ' +
        error.resourceType +
        ' · +' +
        error.elapsedMs +
        ' ms · ' +
        error.url,
    ),
    ...t.brokenImages,
    ...(t.warnings || []),
    ...t.textClipped.map((x) => `${x.selector}: ${x.text}`),
  ]
  if (diagnostics.length) {
    const details = el('details', 'diagnostics')
    details.append(el('summary', null, `Diagnostic details (${diagnostics.length})`))
    const list = el('ul')
    for (const item of diagnostics) list.append(el('li', null, item))
    details.append(list)
    more.append(details)
    moreParts.push(`${diagnostics.length} diagnostic${diagnostics.length > 1 ? 's' : ''}`)
  }
  const c = state.critique[t.id]
  if (c) {
    const box = el('div', 'crit')
    box.append(
      el(
        'b',
        null,
        c.verdict === 'pass'
          ? 'Critique: pass'
          : c.verdict === 'fix'
            ? 'Critique: needs work'
            : 'Critique unavailable',
      ),
    )
    if (c.error) box.append(el('p', null, c.error))
    if (c.issues?.length) {
      const list = el('ul')
      for (const issue of c.issues) {
        const item = el('li')
        item.append(
          el('span', 'sev', `${issue.severity} `),
          document.createTextNode(issue.what + (issue.where ? ` (${issue.where})` : '')),
        )
        list.append(item)
      }
      box.append(list)
    }
    more.append(box)
    badges.append(
      el(
        'span',
        `badge${c.verdict === 'pass' ? ' ok' : c.verdict === 'fix' ? '' : ' warn'}`,
        c.verdict === 'pass'
          ? 'Critique: pass'
          : c.verdict === 'fix'
            ? 'Critique: needs work'
            : 'Critique unavailable',
      ),
    )
    moreParts.push('critique')
  }
  const comparison = state.comparison[t.id]
  card.append(
    el(
      'p',
      'comparison-status',
      comparisonLabels[comparison?.status] ||
        (state.comparisonLoading ? 'Comparing…' : 'Not compared'),
    ),
  )
  const actions = el('div', 'actions')
  actions.append(inspect)
  for (const [value, label] of [
    ['approve', 'Approve'],
    ['reject', 'Reject'],
  ]) {
    const button = el('button', value, label)
    button.setAttribute('aria-pressed', String(d === value))
    button.disabled = state.pending.has(t.id)
    button.setAttribute('aria-label', `${label} ${t.id}`)
    button.addEventListener('click', () => setDecision(t, value))
    actions.append(button)
  }
  const noteLabel = el('label', 'note-label', 'Review note')
  const note = el('textarea')
  note.placeholder = 'What should change?'
  note.maxLength = 2000
  note.value = state.drafts.get(t.id) ?? state.review[t.id]?.note ?? ''
  note.setAttribute('aria-label', `Review note for ${t.id}`)
  const noteHelp = el('small', null, 'Up to 2,000 characters. Saves when you leave this field.')
  noteHelp.id = `note-help-${state.run.tiles.indexOf(t)}`
  note.setAttribute('aria-describedby', noteHelp.id)
  note.addEventListener('input', () => {
    if (note.value === (state.review[t.id]?.note ?? '') && !state.pending.has(t.id))
      state.drafts.delete(t.id)
    else state.drafts.set(t.id, note.value)
    if (state.failures.has(t.id) && 'note' in state.failures.get(t.id))
      state.failures.get(t.id).note = note.value
    updateControls()
  })
  note.addEventListener('change', () => {
    if (state.drafts.has(t.id)) save(t, { note: note.value })
  })
  noteLabel.append(note, noteHelp)
  more.prepend(noteLabel)
  const hasNote = !!(state.drafts.get(t.id) ?? state.review[t.id]?.note)
  if (hasNote) moreParts.unshift('note')
  more.prepend(
    el('summary', null, `Note & details${moreParts.length ? ` · ${moreParts.join(' · ')}` : ''}`),
  )
  more.open = hasNote || state.failures.has(t.id)
  card.append(actions, more)
  card.addEventListener('focusin', () => {
    state.focus = t.id
    document.querySelectorAll('.tile.focus').forEach((x) => {
      x.classList.remove('focus')
    })
    card.classList.add('focus')
  })
  return card
}
function render() {
  if (!state.run) return
  writeFiltersToUrl()
  renderStats()
  const main = $('#cards')
  main.replaceChildren()
  const visible = visibleTiles()
  state.page = Math.min(state.page, Math.max(0, Math.ceil(visible.length / state.pageSize) - 1))
  for (const pager of document.querySelectorAll('.pagination'))
    pager.hidden = visible.length <= state.pageSize
  $('#page-label').textContent =
    'Page ' +
    (state.page + 1) +
    ' of ' +
    Math.max(1, Math.ceil(visible.length / state.pageSize)) +
    ' · ' +
    Math.min(state.pageSize, visible.length - state.page * state.pageSize) +
    ' captures on this page'
  $('#pagination-bottom .page-label').textContent = $('#page-label').textContent
  for (const button of document.querySelectorAll('[data-page-step]'))
    button.disabled =
      Number(button.dataset.pageStep) < 0
        ? state.page === 0
        : (state.page + 1) * state.pageSize >= visible.length
  if (!state.run.tiles.length) {
    showEmpty(
      'No captures in this run.',
      'Capture your site with the Design Spine CLI, then open the new run for review.',
    )
    return
  }
  if (!visible.length) {
    showEmpty(
      'No captures match.',
      'Try another route, status, width, or theme. Your review decisions are still saved.',
      'Clear filters',
      clearFilters,
    )
    return
  }
  const groups = new Map()
  for (const t of visible.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize)) {
    if (!groups.has(t.route)) groups.set(t.route, new Map())
    const states = groups.get(t.route)
    if (!states.has(t.state)) states.set(t.state, [])
    states.get(t.state).push(t)
  }
  for (const [route, states] of groups) {
    const section = el('section', 'route')
    section.id = `route-${[...new Set(state.run.tiles.map((t) => t.route))].indexOf(route)}`
    const heading = el('h2')
    heading.tabIndex = -1
    heading.append(el('code', null, route))
    section.append(heading)
    for (const [name, tiles] of states) {
      const group = el('div', 'state')
      group.append(el('h3', null, name))
      const row = el('div', 'row')
      for (const t of tiles) row.append(renderTile(t))
      group.append(row)
      section.append(group)
    }
    main.append(section)
  }
}
let saveStatusTimer = 0
function setSaveStatus(message, error = false) {
  const box = $('#save-status')
  box.classList.toggle('error', error)
  box.replaceChildren(el('span', null, message))
  clearTimeout(saveStatusTimer)
  if (!error && !state.failures.size && !state.pending.size)
    saveStatusTimer = setTimeout(() => {
      if (!state.failures.size && !state.pending.size) box.replaceChildren()
    }, 3000)
  updateViewerControls()
  if (state.failures.size) {
    const retry = el('button', 'button', 'Retry unsaved changes')
    retry.addEventListener('click', retryFailures)
    box.append(retry)
  }
}
async function save(t, patch) {
  const previous = state.pending.get(t.id) || Promise.resolve()
  const task = previous
    .catch(() => {})
    .then(async () => {
      setSaveStatus('Saving changes…')
      try {
        const response = await fetch(apiPath('/api/review'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tileId: t.id, imageHash: t.imageHash, ...patch }),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const entry = await response.json()
        if (
          !entry ||
          !['approve', 'reject', null].includes(entry.decision) ||
          typeof entry.note !== 'string'
        )
          throw new Error('Invalid save response')
        state.review[t.id] = entry
        if (state.drafts.get(t.id) === entry.note) state.drafts.delete(t.id)
        const failed = state.failures.get(t.id)
        if (failed) {
          for (const key of Object.keys(patch)) delete failed[key]
          if (!Object.keys(failed).length) state.failures.delete(t.id)
        }
        return true
      } catch {
        state.failures.set(t.id, { ...state.failures.get(t.id), ...patch })
        return false
      }
    })
  state.pending.set(t.id, task)
  updateControls()
  // A note saves when its field loses focus, often because the reviewer is clicking Approve.
  // Disabling the buttons then would swallow that click; setDecision waits for the save instead.
  if ('decision' in patch)
    document.querySelectorAll('.tile').forEach((card) => {
      if (card.dataset.id === t.id)
        card.querySelectorAll('.actions button').forEach((button) => {
          button.disabled = true
        })
    })
  const saved = await task
  if (state.pending.get(t.id) === task) state.pending.delete(t.id)
  updateControls()
  document.querySelectorAll('.tile').forEach((card) => {
    if (card.dataset.id === t.id)
      card.querySelectorAll('.actions button').forEach((button) => {
        button.disabled =
          state.pending.has(t.id) || (button.classList.contains('inspect') && !!t.error)
      })
  })
  if (state.failures.size)
    setSaveStatus(
      'Changes could not be saved. Your drafts remain here; retry before leaving.',
      true,
    )
  else if (state.pending.size) setSaveStatus('Saving changes…')
  else
    setSaveStatus(
      state.drafts.size
        ? 'Saved. Other note drafts still need saving.'
        : 'All changes saved locally.',
    )
  return saved
}
const noteFor = (t) => (state.drafts.get(t.id) ?? state.review[t.id]?.note ?? '').trim()
/** Approving past automatic findings needs a written reason; the server enforces the same rule. */
function askForReason(t) {
  const message = `${t.route} · ${t.state} · ${t.viewport}px ${t.theme} has findings: ${flags(t).join('; ')}. Write why they are acceptable in the note, then approve.`
  setSaveStatus(message)
  if ($('#lightbox').open) {
    $('.viewer-note').open = true
    $('#viewer-save-status').textContent = message
    $('#viewer-note').focus()
    return
  }
  const card = document.querySelector(`.tile[data-id="${CSS.escape(t.id)}"]`)
  const more = card?.querySelector('.tile-more')
  if (!more) return
  more.open = true
  more.querySelector('textarea')?.focus()
}
/** Decisions to step back through with `u`, newest last. */
const undoStack = []
async function setDecision(t, value, { record = true } = {}) {
  // Typing a note and then clicking Approve blurs the note first, which starts a save. Wait for it
  // rather than dropping the click.
  if (state.pending.has(t.id)) await state.pending.get(t.id).catch(() => {})
  if (state.pending.has(t.id)) return
  if (value === 'approve' && decision(t) !== 'approve' && isFlagged(t) && !noteFor(t)) {
    askForReason(t)
    return
  }
  const previous = decision(t)
  const before = visibleTiles()
  const index = before.findIndex((x) => x.id === t.id)
  const viewerBefore = viewerTiles()
  const patch = { decision: decision(t) === value ? null : value }
  if (state.drafts.has(t.id)) patch.note = state.drafts.get(t.id)
  const saved = await save(t, patch)
  if (saved && record) {
    undoStack.push({ id: t.id, decision: previous })
    if (undoStack.length > 100) undoStack.shift()
  }
  const keep = state.focus
  render()
  const remaining = visibleTiles()
  if ($('#lightbox').open) reconcileViewer(viewerBefore)
  else
    focusTile(
      remaining.some((x) => x.id === keep)
        ? keep
        : remaining[Math.min(Math.max(0, index), remaining.length - 1)]?.id,
      false,
    )
}
async function undo() {
  const last = undoStack.pop()
  const tile = last && state.run?.tiles.find((t) => t.id === last.id)
  if (!tile || state.pending.has(tile.id)) return
  state.focus = tile.id
  if (decision(tile) === last.decision) return focusTile(tile.id)
  // Toggling the current decision off clears it; choosing the old one restores it.
  await setDecision(tile, last.decision ?? decision(tile), { record: false })
  focusTile(tile.id)
  setSaveStatus(`Undid the last decision on ${tile.route} · ${tile.state}.`)
}
async function retryFailures() {
  const viewerBefore = viewerTiles()
  for (const [id, failed] of [...state.failures]) {
    const tile = state.run.tiles.find((t) => t.id === id)
    if (!tile || state.pending.has(id)) continue
    const patch = { ...failed }
    if (state.drafts.has(id)) patch.note = state.drafts.get(id)
    await save(tile, patch)
  }
  const keep = state.focus
  render()
  if ($('#lightbox').open) reconcileViewer(viewerBefore)
  else focusTile(keep, false)
}
function focusTile(id, scroll = true) {
  state.focus = id || null
  const index = visibleTiles().findIndex((t) => t.id === id)
  if (index >= 0 && Math.floor(index / state.pageSize) !== state.page) {
    state.page = Math.floor(index / state.pageSize)
    render()
  }
  const node = id && document.querySelector(`.tile[data-id="${CSS.escape(id)}"]`)
  if (node) {
    node.focus({ preventScroll: true })
    if (scroll)
      node.scrollIntoView({
        block: 'center',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      })
  } else if (!visibleTiles().length) focusFilterReset()
}
function focusFilterReset() {
  const clear = $('#clear-filters')
  const target = clear.getClientRects().length ? clear : $('#toggle-filters')
  target.focus()
}
function move(direction) {
  const visible = visibleTiles()
  if (!visible.length) return
  const index = visible.findIndex((t) => t.id === state.focus)
  const next =
    index < 0
      ? direction > 0
        ? 0
        : visible.length - 1
      : Math.min(visible.length - 1, Math.max(0, index + direction))
  focusTile(visible[next].id)
}
function updateRegions() {
  const tile = state.run?.tiles.find((t) => t.id === state.viewer)
  const img = $('#viewer-image')
  const note = state.review[tile?.id]?.anchor
  const pin = $('#note-overlay')
  pin.replaceChildren()
  pin.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`)
  pin.toggleAttribute(
    'hidden',
    !note ||
      note.imageHash !== tile?.imageHash ||
      !['current', 'split', 'overlay'].includes($('#viewer-mode').value) ||
      !img.naturalWidth,
  )
  if (!pin.hasAttribute('hidden')) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.setAttribute('cx', note.x)
    circle.setAttribute('cy', note.y)
    circle.setAttribute('r', '10')
    pin.append(circle)
  }
  const supported = ['current', 'split'].includes($('#viewer-mode').value)
  const valid = (b) => [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0
  const boxes = supported
    ? [
        ...(tile?.overflowOffenders || [])
          .filter((o) => valid(o.box))
          .map((o) => ({
            ...o.box,
            kind: 'overflow',
            label: `Wider than the viewport: ${o.selector}`,
          })),
        ...(tile?.blankRegions?.boxes || []).filter(valid).map((b, index) => ({
          ...b,
          kind: 'blank',
          label: `Possible blank region ${index + 1}`,
        })),
      ]
    : []
  $('.diagnostic-controls').hidden = !boxes.length
  const toggle = $('#viewer-regions')
  toggle.disabled = !boxes.length
  const select = $('#viewer-region')
  const selected = select.value
  select.replaceChildren(new Option('Choose a finding', ''))
  boxes.forEach((box, index) => {
    select.add(new Option(box.label, String(index)))
  })
  select.disabled = !boxes.length
  select.value = selected
  const overlay = $('#diagnostic-overlay')
  overlay.replaceChildren()
  overlay.toggleAttribute(
    'hidden',
    !boxes.length ||
      toggle.getAttribute('aria-pressed') !== 'true' ||
      img.hidden ||
      !img.complete ||
      !img.naturalWidth,
  )
  overlay.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`)
  boxes.forEach((box, index) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    for (const [name, value] of Object.entries({ x: box.x, y: box.y, width: box.w, height: box.h }))
      rect.setAttribute(name, value)
    rect.dataset.region = index
    rect.classList.add(box.kind)
    overlay.append(rect)
  })
}
/**
 * Hold B to swap the current screenshot for its baseline in place. Flipping between two images
 * at the same position is the quickest way for a person to see a shift.
 */
function blink(on) {
  const comparison = state.comparison[state.viewer] || {}
  if (!comparison.baselineUrl || $('#viewer-mode').value !== 'current') return
  const img = $('#viewer-image')
  if (on && !img.dataset.blink) {
    img.dataset.blink = img.getAttribute('src')
    img.src = comparison.baselineUrl
    $('#current-caption').textContent = 'Baseline · release B for current'
  } else if (!on && img.dataset.blink) {
    img.setAttribute('src', img.dataset.blink)
    delete img.dataset.blink
    $('#current-caption').textContent = 'Current'
  }
}
document.addEventListener('keyup', (event) => {
  if (event.key === 'b') blink(false)
})
window.addEventListener('blur', () => blink(false))
function viewerTiles() {
  return visibleTiles().filter((t) => !t.error)
}
function reconcileViewer(before) {
  const tiles = viewerTiles()
  const remaining = new Set(tiles.map((t) => t.id))
  if (!remaining.has(state.viewer)) {
    const index = before.findIndex((t) => t.id === state.viewer)
    const neighbors = [...before.slice(index + 1), ...before.slice(0, Math.max(0, index)).reverse()]
    state.viewer = neighbors.find((t) => remaining.has(t.id))?.id || tiles[0]?.id || null
    if (state.viewer) {
      updateViewer()
      $('#viewer-close').focus()
    } else $('#lightbox').close()
  } else updateViewerControls()
}
function updateViewerControls() {
  const tile = state.run?.tiles.find((t) => t.id === state.viewer)
  const pending = !!tile && state.pending.has(tile.id)
  for (const [id, value] of [
    ['#viewer-approve', 'approve'],
    ['#viewer-reject', 'reject'],
  ]) {
    $(id).disabled = !tile || pending
    $(id).setAttribute('aria-pressed', String(!!tile && decision(tile) === value))
  }
  $('#viewer-decision').textContent = tile ? decisionLabel(tile) : 'Pending'
  $('#viewer-save-note').disabled = !tile || pending || !state.drafts.has(tile.id)
  $('#viewer-pending').disabled = !viewerTiles().some((t) => t.id !== state.viewer && awaiting(t))
  $('#viewer-retry').hidden = !state.failures.size
  $('#viewer-retry').disabled = !!state.pending.size
  $('#viewer-note-summary').textContent =
    'Review note' +
    (tile && state.drafts.has(tile.id)
      ? ' · unsaved'
      : tile && state.review[tile.id]?.note
        ? ' · saved'
        : '')
  const status = $('#viewer-save-status')
  status.classList.toggle('error', !!state.failures.size)
  status.textContent = state.failures.size
    ? 'Changes could not be saved. Your drafts remain here; retry before leaving.'
    : state.pending.size
      ? 'Saving changes…'
      : state.drafts.size
        ? 'Unsaved note drafts remain. Save each note or include it with a decision.'
        : 'All changes saved locally. Baselines have not changed.'
}
function updateViewer() {
  // A held B from the previous screenshot must not restore its image onto this one.
  delete $('#viewer-image').dataset.blink
  const tiles = viewerTiles()
  const index = tiles.findIndex((t) => t.id === state.viewer)
  const tile = tiles[index]
  if (!tile) return
  state.focus = tile.id
  const url = new URL(location.href)
  url.searchParams.set('tile', tile.id)
  history.replaceState(null, '', url)
  $('#viewer-note').value = state.drafts.get(tile.id) ?? state.review[tile.id]?.note ?? ''
  updateViewerControls()
  $('#viewer-title').textContent = `${tile.route} · ${tile.state}`
  $('#viewer-position').textContent =
    `${tile.viewport}px · ${tile.theme} · ${index + 1} of ${tiles.length}`
  const comparison = state.comparison[tile.id] || {}
  const mode = $('#viewer-mode')
  for (const option of mode.options)
    option.disabled =
      option.value === 'diff'
        ? !comparison.diffUrl
        : ['baseline', 'split', 'overlay'].includes(option.value) && !comparison.baselineUrl
  if (mode.selectedOptions[0].disabled) mode.value = 'current'
  if (comparison.status === 'size-changed') {
    mode.querySelector('[value=overlay]').disabled = true
    if (mode.value === 'overlay') mode.value = 'current'
  }
  const view = mode.value
  $('#overlay-image').hidden = view !== 'overlay'
  $('#overlay-image').src = view === 'overlay' ? comparison.baselineUrl : ''
  $('#blend-control').hidden = view !== 'overlay'
  const changes = $('#change-region')
  changes.replaceChildren(new Option('Choose a change', ''))
  ;(comparison.regions || []).forEach((box, index) => {
    changes.add(new Option(`Change ${index + 1} · y ${box.y}px`, String(index)))
  })
  changes.disabled = !comparison.regions?.length || view === 'baseline'
  $('#anchor-note').disabled = !tile.imageHash || view !== 'current' || state.pending.has(tile.id)
  $('#anchor-note').setAttribute('aria-pressed', 'false')
  const anchor = state.review[tile.id]?.anchor
  $('#clear-anchor').hidden = !anchor
  $('#jump-anchor').hidden =
    !anchor ||
    anchor.imageHash !== tile.imageHash ||
    !['current', 'split', 'overlay'].includes(view)
  $('#anchor-x').value = anchor?.x ?? 0
  $('#anchor-y').value = anchor?.y ?? 0
  $('#save-anchor').disabled = !tile.imageHash || view !== 'current' || state.pending.has(tile.id)
  $('#anchor-status').textContent = anchor
    ? anchor.imageHash === tile.imageHash
      ? `Note location: ${anchor.x}, ${anchor.y}px.`
      : 'Note location belongs to different evidence.'
    : ''
  $('#viewer-size').disabled = view === 'split'
  if (view === 'split') {
    $('#viewer-image').classList.remove('actual')
    $('#baseline-image').classList.remove('actual')
    $('#viewer-size').setAttribute('aria-pressed', 'false')
    $('#viewer-size').textContent = 'Actual size'
  }
  $('#baseline-pane').hidden = view !== 'split'
  $('.viewer-pair').classList.toggle('split', view === 'split')
  $('#baseline-image').src = view === 'split' ? comparison.baselineUrl : ''
  $('#baseline-image').alt = `Baseline for ${tile.route}, ${tile.state}`
  $('#current-caption').textContent =
    view === 'baseline'
      ? 'Baseline'
      : view === 'diff'
        ? 'Difference · highlighted pixels'
        : 'Current'
  $('#comparison-context').textContent =
    (comparisonLabels[comparison.status] || 'Not compared') +
    ' · threshold ' +
    (state.threshold * 100).toFixed(2) +
    '%' +
    (comparison.ratio !== undefined
      ? ` · ${(comparison.ratio * 100).toFixed(3)}% pixels differ`
      : '') +
    (comparison.baselineRun ? ` · baseline ${comparison.baselineRun}` : '') +
    (comparison.baselineUrl && view === 'current' ? ' · hold B to flash the baseline' : '') +
    (comparison.approvedAt ? ` · approved ${comparison.approvedAt}` : '') +
    (comparison.ignored?.length
      ? ` · ${comparison.ignored.length} comparison masks; original evidence retained`
      : '') +
    (comparison.recipeCompatible === false ? ' · capture recipe differs or unknown' : '') +
    (comparison.provenance ? ` · environment ${comparison.provenance}` : '') +
    (comparison.status === 'size-changed'
      ? ' · Native dimensions differ; pixel overlay unavailable.'
      : '')
  const findings = $('#viewer-findings')
  findings.replaceChildren()
  const found = flags(tile)
  for (const text of found) findings.append(el('li', 'badge', text))
  for (const text of tile.warnings || []) findings.append(el('li', 'badge warn', text))
  if (tile.textClipped?.length)
    findings.append(
      el(
        'li',
        'badge warn',
        `Possible clipped text: ${tile.textClipped.map((x) => x.selector).join(', ')}`,
      ),
    )
  if (!findings.children.length) findings.append(el('li', 'badge ok', 'Checks clear'))
  const structure = comparison.structure || []
  $('#viewer-structure').hidden = !structure.length
  $('#viewer-structure-summary').textContent =
    `Accessibility tree changes (${structure.length} line${structure.length === 1 ? '' : 's'})`
  $('#viewer-structure-lines').textContent = structure.join('\n')
  const img = $('#viewer-image')
  img.hidden = false
  $('#viewer-error').hidden = true
  img.alt =
    $('#current-caption').textContent +
    ' for ' +
    tile.route +
    ', ' +
    tile.state +
    ', ' +
    tile.viewport +
    'px, ' +
    tile.theme
  img.src =
    view === 'baseline'
      ? comparison.baselineUrl
      : view === 'diff'
        ? comparison.diffUrl
        : apiPath(`/img/${encodeURIComponent(tile.file)}`)
  $('#viewer-download').href = img.src
  $('#viewer-download').download = tile.file
  $('#viewer-download').setAttribute('aria-disabled', 'false')
  $('#viewer-download').removeAttribute('tabindex')
  $('#viewer-prev').disabled = index <= 0
  $('#viewer-next').disabled = index >= tiles.length - 1
  $('.evidence-frame').classList.toggle('actual', img.classList.contains('actual'))
  updateRegions()
  $('.viewer-canvas').scrollTop = 0
  $('.viewer-canvas').scrollLeft = 0
}
function openBox(tile, source = document.activeElement) {
  if (tile.error) return
  $('#viewer-mode').value = 'current'
  state.viewer = tile.id
  state.returnFocus = source
  $('#viewer-image').classList.remove('actual')
  $('#baseline-image').classList.remove('actual')
  $('#viewer-size').setAttribute('aria-pressed', 'false')
  $('#viewer-size').textContent = 'Actual size'
  const url = new URL(location.href)
  url.searchParams.set('tile', tile.id)
  history.replaceState(null, '', url)
  updateViewer()
  $('#lightbox').showModal()
  $('#viewer-close').focus()
}
function changeViewer(direction) {
  const tiles = viewerTiles()
  const index = tiles.findIndex((t) => t.id === state.viewer)
  const tile = tiles[index + direction]
  if (tile) {
    state.viewer = tile.id
    updateViewer()
  }
}
$('#save-anchor').addEventListener('click', async () => {
  const tile = state.run.tiles.find((t) => t.id === state.viewer)
  const x = Number($('#anchor-x').value),
    y = Number($('#anchor-y').value)
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= $('#viewer-image').naturalWidth ||
    y >= $('#viewer-image').naturalHeight
  ) {
    $('#anchor-status').textContent = 'Enter coordinates within the original screenshot dimensions.'
    return
  }
  await save(tile, { anchor: { x, y, imageHash: tile.imageHash } })
  updateViewer()
})
$('#jump-anchor').addEventListener('click', () => {
  const anchor = state.review[state.viewer]?.anchor
  if (!anchor) return
  const image = $('#viewer-image')
  const canvas = $('.viewer-canvas')
  const bounds = image.getBoundingClientRect()
  const container = canvas.getBoundingClientRect()
  canvas.scrollTop +=
    bounds.top - container.top + (anchor.y * bounds.height) / image.naturalHeight - 24
})
$('#blend').addEventListener('input', (event) => {
  $('#overlay-image').style.opacity = event.target.value / 100
})
$('#change-region').addEventListener('change', (event) => {
  const box = state.comparison[state.viewer]?.regions?.[Number(event.target.value)]
  const img = $('#viewer-image')
  if (event.target.value === '' || !box || !img.naturalHeight) return
  const canvas = $('.viewer-canvas')
  const bounds = img.getBoundingClientRect()
  const container = canvas.getBoundingClientRect()
  canvas.scrollTop += bounds.top - container.top + (box.y * bounds.height) / img.naturalHeight - 24
})
$('#anchor-note').addEventListener('click', () => {
  const button = $('#anchor-note')
  const active = button.getAttribute('aria-pressed') !== 'true'
  button.setAttribute('aria-pressed', String(active))
  $('#anchor-status').textContent = active
    ? 'Click the screenshot to save the location for this note.'
    : ''
})
$('#viewer-image').addEventListener('click', async (event) => {
  if ($('#anchor-note').getAttribute('aria-pressed') !== 'true') return
  const tile = state.run.tiles.find((t) => t.id === state.viewer)
  const image = event.currentTarget
  const bounds = image.getBoundingClientRect()
  const anchor = {
    x: Math.min(
      image.naturalWidth - 1,
      Math.max(0, Math.floor(((event.clientX - bounds.left) * image.naturalWidth) / bounds.width)),
    ),
    y: Math.min(
      image.naturalHeight - 1,
      Math.max(0, Math.floor(((event.clientY - bounds.top) * image.naturalHeight) / bounds.height)),
    ),
    imageHash: tile.imageHash,
  }
  await save(tile, { anchor })
  updateViewer()
})
$('#clear-anchor').addEventListener('click', async () => {
  const tile = state.run.tiles.find((t) => t.id === state.viewer)
  await save(tile, { anchor: null })
  updateViewer()
})
$('#viewer-note').addEventListener('input', (event) => {
  const tile = state.run?.tiles.find((t) => t.id === state.viewer)
  if (!tile) return
  const value = event.target.value
  if (value === (state.review[tile.id]?.note ?? '') && !state.pending.has(tile.id))
    state.drafts.delete(tile.id)
  else state.drafts.set(tile.id, value)
  if (state.failures.has(tile.id) && 'note' in state.failures.get(tile.id))
    state.failures.get(tile.id).note = value
  updateControls()
})
$('#viewer-save-note').addEventListener('click', async () => {
  const tile = state.run?.tiles.find((t) => t.id === state.viewer)
  if (tile && state.drafts.has(tile.id) && !state.pending.has(tile.id)) {
    await save(tile, { note: state.drafts.get(tile.id) })
    render()
  }
})
for (const [id, value] of [
  ['#viewer-approve', 'approve'],
  ['#viewer-reject', 'reject'],
])
  $(id).addEventListener('click', () => {
    const tile = state.run?.tiles.find((t) => t.id === state.viewer)
    if (tile) setDecision(tile, value)
  })
$('#viewer-pending').addEventListener('click', () => {
  const tiles = viewerTiles()
  const index = tiles.findIndex((t) => t.id === state.viewer)
  const next = [...tiles.slice(index + 1), ...tiles.slice(0, index)].find(awaiting)
  if (next) {
    state.viewer = next.id
    updateViewer()
  }
})
$('#viewer-retry').addEventListener('click', retryFailures)
$('#viewer-close').addEventListener('click', () => $('#lightbox').close())
$('#lightbox').addEventListener('close', () => {
  const url = new URL(location.href)
  url.searchParams.delete('tile')
  history.replaceState(null, '', url)
  const viewed = state.viewer
  const inspect =
    state.returnFocus?.classList.contains('inspect') &&
    state.returnFocus.closest('.tile')?.dataset.id === viewed
  state.viewer = null
  render()
  if (state.returnFocus?.dataset.coverageTile && state.returnFocus.isConnected) {
    state.returnFocus.focus({ preventScroll: true })
    return
  }
  if (visibleTiles().some((t) => t.id === viewed)) {
    focusTile(viewed, false)
    if (inspect)
      document
        .querySelector(`.tile[data-id="${CSS.escape(viewed)}"] .inspect`)
        ?.focus({ preventScroll: true })
  } else focusFilterReset()
})
$('#lightbox').addEventListener('click', (event) => {
  if (event.target === $('#lightbox')) {
    const rect = event.target.getBoundingClientRect()
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      event.target.close()
  }
})
$('#viewer-mode').addEventListener('change', () => {
  $('#viewer-region').value = ''
  updateViewer()
})
$('#viewer-image').addEventListener('load', updateRegions)
$('#viewer-regions').addEventListener('click', () => {
  const button = $('#viewer-regions')
  const enabled = button.getAttribute('aria-pressed') !== 'true'
  button.setAttribute('aria-pressed', String(enabled))
  button.textContent = enabled ? 'Hide findings' : 'Show findings'
  updateRegions()
})
$('#viewer-region').addEventListener('change', () => {
  const value = $('#viewer-region').value
  if (value === '') return
  $('#viewer-regions').setAttribute('aria-pressed', 'true')
  $('#viewer-regions').textContent = 'Hide findings'
  updateRegions()
  $('#diagnostic-overlay')
    .querySelector(`[data-region="${value}"]`)
    ?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
})
$('#viewer-refresh').addEventListener('click', async () => {
  const button = $('#viewer-refresh')
  button.disabled = true
  try {
    await loadComparison()
    if (state.viewer) updateViewer()
  } finally {
    button.disabled = false
  }
})
$('#baseline-image').addEventListener('error', () => {
  if (!$('#baseline-pane').hidden) $('#viewer-error').hidden = false
})
$('#viewer-prev').addEventListener('click', () => changeViewer(-1))
$('#viewer-next').addEventListener('click', () => changeViewer(1))
$('#viewer-size').addEventListener('click', () => {
  const actual = $('#viewer-image').classList.toggle('actual')
  $('#baseline-image').classList.toggle('actual', actual)
  $('.evidence-frame').classList.toggle('actual', actual)
  $('#viewer-size').setAttribute('aria-pressed', String(actual))
  $('#viewer-size').textContent = actual ? 'Fit to width' : 'Actual size'
})
$('#viewer-image').addEventListener('error', () => {
  $('#viewer-image').hidden = true
  $('#diagnostic-overlay').setAttribute('hidden', '')
  $('#viewer-download').removeAttribute('href')
  $('#viewer-download').setAttribute('aria-disabled', 'true')
  $('#viewer-download').tabIndex = -1
  $('#viewer-error').hidden = false
})
document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if ($('#lightbox').open) {
    if (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
      event.target.isContentEditable
    )
      return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      changeViewer(1)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      changeViewer(-1)
    }
    if (event.key === 'b' && !event.repeat) {
      event.preventDefault()
      blink(true)
    }
    return
  }
  if (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
    event.target.isContentEditable
  )
    return
  const tile = state.run?.tiles.find((t) => t.id === state.focus)
  if (event.key === 'j') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'k') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'a' && tile) setDecision(tile, 'approve')
  else if (event.key === 'r' && tile) setDecision(tile, 'reject')
  else if (event.key === 'u') {
    event.preventDefault()
    undo()
  } else if (event.key === 'Enter' && tile && event.target.classList.contains('tile')) {
    event.preventDefault()
    openBox(tile)
  }
})
function clearFilters() {
  state.page = 0
  state.search = ''
  state.status = ''
  state.evidence = ''
  state.viewport = ''
  state.theme = ''
  state.onlyFlagged = false
  state.onlyWarnings = false
  state.onlyUnreviewed = false
  state.onlyChanged = false
  $('#search').value = ''
  for (const id of ['#status-filter', '#comparison-filter', '#viewport-filter', '#theme-filter'])
    $(id).value = ''
  $('#f-changed').setAttribute('aria-pressed', 'false')
  $('#f-flagged').setAttribute('aria-pressed', 'false')
  $('#f-warnings').setAttribute('aria-pressed', 'false')
  $('#f-unrev').setAttribute('aria-pressed', 'false')
  render()
}
$('#toggle-filters').addEventListener('click', () => {
  const expanded = $('#toggle-filters').getAttribute('aria-expanded') !== 'true'
  $('#toggle-filters').setAttribute('aria-expanded', String(expanded))
  $('.toolbar').dataset.expanded = String(expanded)
})
for (const [id, key] of [
  ['#f-changed', 'onlyChanged'],
  ['#f-flagged', 'onlyFlagged'],
  ['#f-warnings', 'onlyWarnings'],
  ['#f-unrev', 'onlyUnreviewed'],
])
  $(id).addEventListener('click', (event) => {
    state.page = 0
    state[key] = !state[key]
    if (key === 'onlyChanged') {
      state.evidence = ''
      $('#comparison-filter').value = ''
    }
    event.currentTarget.setAttribute('aria-pressed', String(state[key]))
    render()
  })
for (const [id, key] of [
  ['#status-filter', 'status'],
  ['#comparison-filter', 'evidence'],
  ['#viewport-filter', 'viewport'],
  ['#theme-filter', 'theme'],
])
  $(id).addEventListener('change', (event) => {
    state.page = 0
    state[key] = event.target.value
    if (key === 'evidence') {
      state.onlyChanged = false
      $('#f-changed').setAttribute('aria-pressed', 'false')
    }
    render()
  })
$('#search').addEventListener('input', (event) => {
  state.page = 0
  state.search = event.target.value.trim().toLowerCase()
  render()
})
function changePage(direction) {
  state.page += direction
  render()
  focusTile(visibleTiles()[state.page * state.pageSize]?.id)
}
for (const button of document.querySelectorAll('[data-page-step]'))
  button.addEventListener('click', () => changePage(Number(button.dataset.pageStep)))
$('#clear-filters').addEventListener('click', clearFilters)
$('#next-pending').addEventListener('click', () => {
  const pending = visibleTiles().filter(awaiting)
  const index = pending.findIndex((t) => t.id === state.focus)
  focusTile(pending[(index + 1) % pending.length]?.id)
})
$('#export').addEventListener('click', () => {
  if (
    !state.run ||
    state.drafts.size ||
    state.pending.size ||
    state.failures.size ||
    state.comparisonLoading
  )
    return
  const report = {
    exportedAt: new Date().toISOString(),
    run: state.run,
    review: { tiles: state.review },
    critique: { tiles: state.critique },
    comparison: {
      status: state.comparisonFailed ? 'unavailable' : 'complete',
      comparedAt: state.comparedAt,
      threshold: state.threshold,
      tiles: state.comparison,
    },
  }
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: 'application/json' }),
  )
  const link = el('a')
  link.href = url
  link.download = `design-spine-${state.run.id.replace(/[^a-zA-Z0-9_-]/g, '-')}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  setSaveStatus('Review report downloaded. Baselines have not changed.')
})
window.addEventListener('beforeunload', (event) => {
  if (state.drafts.size || state.pending.size || state.failures.size) {
    event.preventDefault()
    event.returnValue = ''
  }
})
// Contact sheet: the same cards, laid out as dense film strips. Decisions, focus and keys are unchanged.
function setView(sheet) {
  if (sheet) document.body.dataset.view = 'sheet'
  else delete document.body.dataset.view
  $('#view-toggle').setAttribute('aria-pressed', String(sheet))
  try {
    localStorage.setItem('spine-view', sheet ? 'sheet' : 'cards')
  } catch {}
}
$('#view-toggle').addEventListener('click', () => setView(document.body.dataset.view !== 'sheet'))
try {
  if (localStorage.getItem('spine-view') === 'sheet') setView(true)
} catch {}
readFiltersFromUrl()
load()
