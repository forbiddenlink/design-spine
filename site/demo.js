const demo = document.querySelector('.demo')
const note = document.querySelector('#demo-note')
const status = demo.querySelector('[role="status"]')
const views = demo.querySelectorAll('[data-demo-view]')

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
  status.textContent =
    'Example rejected. ' +
    (note.value.trim() || 'Banner covers the action.') +
    ' Nothing was saved.'
})
document.querySelector('#demo-reset').addEventListener('click', () => {
  note.value = ''
  selectView('current')
  status.textContent = 'Pending · example only, nothing is saved.'
})
