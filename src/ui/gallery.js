// "Show all" gallery: an overlay with a thumbnail grid of every live creation,
// search by name, sort by recent or name, and the recently deleted list.
// Files dropped on it are imported.
//
// handlers: onOpen(id), onDelete(id), onRestore(id), onPurge(id), onImportFiles(files),
// onShow() (the gallery wants fresh data: call render).

import { el, formatAge, installFileDrop, thumbElement } from './sidebar.js'
import { closeOnEscape } from './overlays.js'

export function createGallery({ handlers }) {
  const $ = id => document.getElementById(id)
  const gallery = $('gallery'), grid = $('gallery-grid'), deleted = $('gallery-deleted')
  const search = $('gallery-search'), sort = $('gallery-sort')
  let last = { all: [], thumbUrl: () => null }

  function show() {
    gallery.hidden = false
    search.focus()
    handlers.onShow()
  }
  function hide() {
    gallery.hidden = true
  }

  $('btn-gallery-close').addEventListener('click', hide)
  gallery.addEventListener('click', e => { if (e.target === gallery) hide() })
  closeOnEscape(gallery, hide)
  search.addEventListener('input', () => draw())
  sort.addEventListener('change', () => draw())
  installFileDrop(gallery, handlers.onImportFiles)

  grid.addEventListener('click', e => {
    const item = e.target.closest('.gallery-item')
    if (!item) return
    if (e.target.closest('.delete')) return handlers.onDelete(item.dataset.id)
    hide()
    handlers.onOpen(item.dataset.id)
  })
  deleted.addEventListener('click', e => {
    const restore = e.target.closest('[data-restore]'), purge = e.target.closest('[data-purge]')
    if (restore) handlers.onRestore(restore.dataset.restore)
    if (purge) handlers.onPurge(purge.dataset.purge)
  })

  function draw() {
    const { all, thumbUrl } = last
    const now = Date.now()
    const q = search.value.trim().toLowerCase()
    const live = all.filter(c => c.deletedAt == null && c.name.toLowerCase().includes(q))
    if (sort.value === 'name') live.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
    else live.sort((a, b) => b.updatedAt - a.updatedAt)
    grid.replaceChildren(...live.map(c => el('div', { className: 'gallery-item', title: c.name, dataset: { id: c.id } }, [
      thumbElement(c, thumbUrl(c)),
      el('div', { className: 'name', textContent: c.name }),
      el('div', { className: 'meta', textContent: `v${c.versionCount} · ${formatAge(c.updatedAt, now)}` }),
      el('button', { className: 'delete', title: 'Delete', textContent: '✕' }),
    ])))
    if (!live.length) grid.append(el('div', { className: 'dim', textContent: q ? 'No matches' : 'No creations yet' }))

    const gone = all.filter(c => c.deletedAt != null).sort((a, b) => b.deletedAt - a.deletedAt)
    deleted.replaceChildren(...gone.map(c => el('div', { className: 'deleted-item' }, [
      el('span', { className: 'name', textContent: c.name }),
      el('span', { className: 'dim', textContent: `deleted ${formatAge(c.deletedAt, now)}` }),
      el('button', { textContent: 'Restore', title: 'Bring this creation back', dataset: { restore: c.id } }),
      el('button', { textContent: 'Delete forever', title: 'Delete this creation and all its versions for good', dataset: { purge: c.id } }),
    ])))
    if (!gone.length) deleted.append(el('div', { className: 'dim', textContent: 'Nothing deleted' }))
  }

  return {
    show,
    hide,
    get isOpen() { return !gallery.hidden },
    // `all` includes deleted creations; `thumbUrl(c)` gives an image URL or null.
    render(all, thumbUrl) {
      last = { all, thumbUrl }
      draw()
    },
  }
}
