// Library sidebar: recent creations with thumbnails, New (template menu), Show all,
// Export / Import, the backup nudge, and the collapse toggle. Files dropped on it
// are imported.
//
// It only renders and reports clicks; the handlers do the library work:
// onOpen(id), onDelete(id), onNew(templateId), onShowAll(), onExport(),
// onImportFiles(files), onToggle(open).

// A short age for a timestamp: "now", "5m", "3h", "2d", "6w", or a date past a year.
export function formatAge(t, now = Date.now()) {
  const s = Math.max(0, (now - t) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d`
  if (s < 86400 * 365) return `${Math.floor(s / 86400 / 7)}w`
  return new Date(t).toLocaleDateString()
}

// The creation's thumbnail image, or a placeholder naming its mode (when not auto).
export function thumbElement(creation, url) {
  if (url) {
    const img = document.createElement('img')
    img.className = 'thumb'
    img.src = url
    img.alt = ''
    return img
  }
  const div = document.createElement('div')
  div.className = 'thumb placeholder'
  div.textContent = creation.mode && creation.mode !== 'auto' ? creation.mode : 'no preview'
  return div
}

// A new element with properties (`dataset` entries are copied) and children.
export function el(tag, { dataset = {}, ...props } = {}, children = []) {
  const e = Object.assign(document.createElement(tag), props)
  Object.assign(e.dataset, dataset)
  e.append(...children)
  return e
}

// Calls onFiles(File[]) for files dropped on `target`.
export function installFileDrop(target, onFiles) {
  const isFileDrag = e => [...(e.dataTransfer?.types ?? [])].includes('Files')
  target.addEventListener('dragover', e => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    target.classList.add('drop-target')
  })
  target.addEventListener('dragleave', e => {
    if (!target.contains(e.relatedTarget)) target.classList.remove('drop-target')
  })
  target.addEventListener('drop', e => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    target.classList.remove('drop-target')
    const files = [...e.dataTransfer.files]
    if (files.length) onFiles(files)
  })
}

export function createSidebar({ templates, open = true, handlers }) {
  const $ = id => document.getElementById(id)
  const sidebar = $('sidebar'), list = $('lib-list'), menu = $('template-menu')
  const toggle = $('btn-sidebar-toggle'), importInput = $('import-input'), nudge = $('backup-nudge')

  function setOpen(on) {
    sidebar.classList.toggle('collapsed', !on)
    toggle.setAttribute('aria-expanded', String(on))
  }
  setOpen(open)
  toggle.addEventListener('click', () => {
    const on = sidebar.classList.contains('collapsed')
    setOpen(on)
    handlers.onToggle(on)
  })

  // --- New: template menu ---

  menu.replaceChildren(...templates.map(t => el('button', {
    textContent: t.name, title: `New ${t.name} creation`, dataset: { template: t.id },
  })))
  $('btn-new').addEventListener('click', () => { menu.hidden = !menu.hidden })
  menu.addEventListener('click', e => {
    const button = e.target.closest('[data-template]')
    if (!button) return
    menu.hidden = true
    handlers.onNew(button.dataset.template)
  })

  // --- Footer ---

  $('btn-show-all').addEventListener('click', () => handlers.onShowAll())
  $('btn-export').addEventListener('click', () => handlers.onExport())
  nudge.querySelector('button').addEventListener('click', () => handlers.onExport())
  $('btn-import').addEventListener('click', () => importInput.click())
  importInput.addEventListener('change', () => {
    const files = [...importInput.files]
    importInput.value = ''
    if (files.length) handlers.onImportFiles(files)
  })
  installFileDrop(sidebar, handlers.onImportFiles)

  // --- List ---

  list.addEventListener('click', e => {
    const item = e.target.closest('.lib-item')
    if (!item) return
    if (e.target.closest('.delete')) handlers.onDelete(item.dataset.id)
    else handlers.onOpen(item.dataset.id)
  })

  return {
    // `creations` are the ones to show, most recent first; `thumbUrl(c)` gives an image URL or null.
    render(creations, currentId, thumbUrl) {
      const now = Date.now()
      list.replaceChildren(...creations.map(c => el('div', {
        className: 'lib-item' + (c.id === currentId ? ' current' : ''),
        title: c.name,
        dataset: { id: c.id },
      }, [
        thumbElement(c, thumbUrl(c)),
        el('div', { className: 'name', textContent: c.name }),
        el('div', { className: 'meta', textContent: `v${c.versionCount} · ${formatAge(c.updatedAt, now)}` }),
        el('button', { className: 'delete', title: 'Delete', textContent: '✕' }),
      ])))
    },

    setNudge(text) {
      nudge.hidden = !text
      nudge.querySelector('span').textContent = text ?? ''
    },
  }
}
