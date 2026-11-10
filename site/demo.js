const demo = document.querySelector('.demo')
const note = document.querySelector('#demo-note')
const status = demo.querySelector('[role="status"]')
const views = demo.querySelectorAll('[data-demo-view]')
const hand = demo.querySelector('.demo-hand')

function mark(decision, text = '') {
  if (decision) demo.dataset.decision = decision
  else delete demo.dataset.decision
  hand.textContent = text.length > 36 ? `${text.slice(0, 35)}…` : text
  hand.hidden = !text
}

function selectView(view) {
  demo.dataset.view = view
  for (const button of views)
    button.setAttribute('aria-pressed', String(button.dataset.demoView === view))
  demo.querySelector('.demo-obstruction').hidden = view === 'baseline'
  demo.querySelector('.demo-callout').hidden = view !== 'difference'
  demo
    .querySelector('.demo-canvas')
    .setAttribute(
      'aria-label',
      view === 'baseline'
        ? 'Approved mobile checkout. The Continue button is visible.'
        : 'Example mobile checkout. A consent banner covers the Continue button.',
    )
}

for (const button of demo.querySelectorAll('button')) button.disabled = false
for (const button of views)
  button.addEventListener('click', () => selectView(button.dataset.demoView))
document.querySelector('#demo-review').addEventListener('submit', (event) => {
  event.preventDefault()
  const text = note.value.trim() || 'Banner covers the action.'
  mark('reject', text)
  status.textContent = `Example rejected. ${text} Nothing was saved.`
})
document.querySelector('#demo-approve').addEventListener('click', () => {
  mark('approve')
  status.textContent = 'Example approved. Nothing was saved.'
})
document.querySelector('#demo-reset').addEventListener('click', () => {
  note.value = ''
  mark(null)
  selectView('current')
  status.textContent = 'Pending · example only, nothing is saved.'
})

const matrix = document.querySelector('.mx')
if (matrix) {
  const inputs = [...matrix.querySelectorAll('input[type="range"]')]
  const grid = matrix.querySelector('.mx-grid')
  const limit = 480
  const draw = () => {
    const [routes, states, widths, themes] = inputs.map((input) => Number(input.value))
    for (const input of inputs) input.nextElementSibling.textContent = input.value
    const total = routes * states * widths * themes
    const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
    matrix.querySelector('#mx-count').textContent = String(total)
    matrix.querySelector('.mx-total span').textContent = total === 1 ? 'screen' : 'screens'
    matrix.querySelector('#mx-sum').textContent =
      `${plural(routes, 'route')} × ${plural(states, 'state')} × ` +
      `${plural(widths, 'width')} × ${plural(themes, 'theme')}`
    grid.replaceChildren()
    let drawn = 0
    for (let route = 0; route < routes && drawn < limit; route++) {
      const group = document.createElement('span')
      group.className = 'mx-route'
      for (let state = 0; state < states; state++)
        for (let width = 0; width < widths; width++)
          for (let theme = 0; theme < themes && drawn < limit; theme++) {
            const cell = document.createElement('span')
            cell.className = `mx-cell${theme ? ' dark' : ''}`
            cell.dataset.w = String(width)
            if (!route && !state && width === widths - 1 && !theme) cell.classList.add('seen')
            group.append(cell)
            drawn++
          }
      grid.append(group)
    }
    if (total > drawn) {
      const more = document.createElement('span')
      more.className = 'mx-more'
      more.textContent = `+${total - drawn} more`
      grid.append(more)
    }
    grid.setAttribute(
      'aria-label',
      `${plural(total, 'screen')} in the matrix. One is marked as checked.`,
    )
  }
  for (const input of inputs) input.addEventListener('input', draw)
  draw()
}

const loupe = document.querySelector('#loupe')
if (loupe) {
  for (const button of document.querySelectorAll('.frame-open'))
    button.addEventListener('click', () => {
      const image = button.querySelector('img')
      const large = loupe.querySelector('img')
      large.src = image.getAttribute('src').replace('.webp', '@2x.webp')
      large.alt = image.alt
      large.width = image.width * 2
      large.height = image.height * 2
      loupe.querySelector('#loupe-cap').textContent = button
        .closest('figure')
        .querySelector('figcaption').textContent
      loupe.showModal()
    })
  loupe.addEventListener('click', (event) => {
    if (event.target === loupe) loupe.close()
  })
}

const shots = {
  cards: [
    'Review app card grid: sixteen captures, each with its screenshot, check result and approve and reject buttons.',
    'Every capture as a card. Screens identical to their approved baseline are marked Matches baseline and stay out of the queue.',
  ],
  sheet: [
    'Review app contact sheet view: film strips of captures per route, with two pricing frames crossed out.',
    'Contact sheet view. The two /pricing frames at 1280 are crossed out as rejected.',
  ],
  coverage: [
    'Review app coverage matrix: a table of routes and states against widths and themes, two cells marked rejected.',
    'Coverage matrix: one row per route and state, one column per width and theme.',
  ],
  compare: [
    'Review app inspector comparing the approved baseline beside the current capture of the pricing page.',
    'Compare both: the approved baseline beside the current capture. The cookie dialog at the bottom left is the change; 1.43% of pixels differ.',
  ],
}
const app = document.querySelector('.app')
if (app) {
  const image = app.querySelector('#app-img')
  for (const button of app.querySelectorAll('[data-shot]'))
    button.addEventListener('click', () => {
      const shot = button.dataset.shot
      for (const other of app.querySelectorAll('[data-shot]'))
        other.setAttribute('aria-pressed', String(other === button))
      image.srcset = `shots/app-${shot}-800.webp 800w, shots/app-${shot}.webp 1600w`
      image.src = `shots/app-${shot}.webp`
      image.alt = shots[shot][0]
      app.querySelector('#app-cap').textContent = shots[shot][1]
    })
}

const terminal = document.querySelector('#term-video')
if (
  terminal &&
  'IntersectionObserver' in window &&
  !matchMedia('(prefers-reduced-motion: reduce)').matches
)
  new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) terminal.play().catch(() => {})
      else terminal.pause()
    },
    { threshold: 0.5 },
  ).observe(terminal)
