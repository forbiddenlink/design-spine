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
