// Version history panel: one row per saved version of the open creation, newest
// first, each with Open (load it as the draft) and Fork (new creation from it).
//
// handlers: onOpen(version), onFork(version).

import { el, formatAge } from './sidebar.js'
import { closeOnEscape } from './overlays.js'

export function createHistory({ handlers }) {
  const panel = document.getElementById('history-panel')
  let versions = []

  const hide = () => { panel.hidden = true }
  closeOnEscape(panel, hide)
  document.addEventListener('pointerdown', e => {
    if (!panel.hidden && !panel.contains(e.target) && e.target.id !== 'btn-history') hide()
  })

  panel.addEventListener('click', e => {
    const button = e.target.closest('[data-action]')
    if (!button) return
    const version = versions.find(v => v.id === button.closest('[data-version-id]').dataset.versionId)
    hide()
    if (button.dataset.action === 'open') handlers.onOpen(version)
    else handlers.onFork(version)
  })

  return {
    hide,
    get isOpen() { return !panel.hidden },
    // `versions` newest first; `headId` is the latest version, `viewedId` the one loaded from here.
    show(list, { headId = null, viewedId = null } = {}) {
      versions = list
      const now = Date.now()
      panel.replaceChildren(
        el('h5', { textContent: 'Versions' }),
        ...list.map(v => el('div', {
          className: 'version' + (v.id === viewedId ? ' viewed' : ''),
          dataset: { versionId: v.id },
          title: new Date(v.createdAt).toLocaleString(),
        }, [
          el('span', { className: 'n', textContent: `v${v.n}` }),
          el('span', { className: 'dim', textContent: formatAge(v.createdAt, now) + (v.id === headId ? ' · latest' : '') }),
          el('span', { className: 'spacer' }),
          el('button', { textContent: 'Open', title: 'Load this version into the editor; Save then adds it as a new version', dataset: { action: 'open' } }),
          el('button', { textContent: 'Fork', title: 'Start a new creation from this version', dataset: { action: 'fork' } }),
        ])),
      )
      panel.hidden = false
    },
  }
}
