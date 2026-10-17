// Connects the library (IndexedDB) to the session and the library UI: boot, open,
// save, fork, history, new from template, delete/restore, export/import, backup nudge.
//
// With `lib` null (the library could not be opened) the app runs in memory:
// #library-error shows, the sidebar stays hidden, and Save downloads a .txt file.
// If the library opens but no creation can be loaded at boot, the app also falls
// back to an in-memory creation (Save then downloads too).

import { createSidebar } from '../ui/sidebar.js'
import { createGallery } from '../ui/gallery.js'
import { createHistory } from '../ui/history.js'
import { downloadBlob } from '../ui/download.js'
import { makeThumbnail } from '../library/thumbnail.js'
import { exportLibrary, importLibrary, backupFileName } from '../library/backup.js'
import { importTextFiles } from '../library/textImport.js'
import { TEMPLATES } from '../library/templates.js'
import { DEFAULT_CREATION_SETTINGS } from '../library/library.js'
import { detectMode } from '../code/detect.js'
import { MODES } from '../runner/protocol.js'

export const SIDEBAR_COUNT = 30
export const NUDGE_AFTER_MS = 14 * 24 * 3600 * 1000
const BACKUP_FORMAT = 'capjs-library'

export function createLibraryController({ session, settings, saveSettings, lib }) {
  const $ = id => document.getElementById(id)
  const discardButton = $('btn-discard')

  let viewedVersionId = null // a version loaded from History; Fork records it as the parent
  let openSeq = 0
  let saving = false

  const downloadText = () => downloadBlob(new Blob([session.code], { type: 'text/plain' }), `${session.creation.name}.txt`)

  // A creation that lives only in memory: the share link's program, or the dweet template.
  function openInMemory(shared) {
    const start = sharedStart(shared)
    const t = TEMPLATES.find(t => t.id === 'dweet')
    session.open({
      creation: { id: null, name: start?.name ?? t.name },
      version: {
        code: start?.code ?? t.code, mode: start ? sharedMode(start) : templateMode(t),
        runMode: 'auto', settings: DEFAULT_CREATION_SETTINGS,
      },
      safeStart: true,
    })
  }

  if (!lib) {
    return {
      actions: { save: downloadText },
      boot(shared) {
        $('library-error').hidden = false
        $('btn-sidebar-toggle').hidden = true
        openInMemory(shared)
      },
    }
  }

  // --- Thumbnails: one object URL per creation, replaced when its record changes ---

  const thumbs = new Map() // id -> {key, url}
  function syncThumbs(all) {
    const seen = new Set()
    for (const c of all) {
      if (!(c.thumbnail instanceof Blob)) continue
      const key = `${c.updatedAt}:${c.thumbnail.size}`
      const had = thumbs.get(c.id)
      if (had?.key !== key) {
        if (had) URL.revokeObjectURL(had.url)
        thumbs.set(c.id, { key, url: URL.createObjectURL(c.thumbnail) })
      }
      seen.add(c.id)
    }
    for (const [id, t] of thumbs) {
      if (!seen.has(id)) { URL.revokeObjectURL(t.url); thumbs.delete(id) }
    }
  }
  const thumbUrl = c => thumbs.get(c.id)?.url ?? null

  // Shows a failure without breaking the caller's flow.
  const report = (what, e) => {
    console.error(what, e)
    alert(`${what}: ${e?.message ?? e}`)
  }
  // Wraps an async action so a failure is reported instead of left unhandled.
  const guard = (what, fn) => (...args) => fn(...args).catch(e => report(what, e))

  // --- UI ---

  const sidebar = createSidebar({
    templates: TEMPLATES,
    open: settings.sidebarOpen,
    handlers: {
      onOpen: guard('Could not open', id => openCreation(id)),
      onDelete: id => deleteCreation(id),
      onNew: id => newFromTemplate(id),
      onShowAll: () => gallery.show(),
      onExport: () => exportAll(),
      onImportFiles: files => importFiles(files),
      onToggle: open => { settings.sidebarOpen = open; saveSettings(settings) },
    },
  })
  const gallery = createGallery({
    handlers: {
      onOpen: guard('Could not open', id => openCreation(id)),
      onDelete: id => deleteCreation(id),
      onRestore: guard('Could not restore', id => lib.restoreCreation(id).then(refresh)),
      onPurge: id => purgeCreation(id),
      onImportFiles: files => importFiles(files),
      onShow: guard('Could not list creations', () => refresh()),
    },
  })
  const history = createHistory({
    handlers: {
      onOpen: v => {
        viewedVersionId = v.id
        session.loadAsDraft(v)
      },
      onFork: v => forkVersion(v.id),
    },
  })

  session.on('codeChanged', ({ modified }) => { discardButton.hidden = !modified })
  discardButton.addEventListener('click', () => {
    if (!confirm('Discard unsaved changes and go back to the last saved version?')) return
    viewedVersionId = null
    session.discardDraft()
  })
  session.on('renamed', guard('Could not refresh the library', () => refresh()))

  async function refresh() {
    const all = await lib.listCreations({ includeDeleted: true })
    syncThumbs(all)
    const live = all.filter(c => c.deletedAt == null)
    sidebar.render(live.slice(0, SIDEBAR_COUNT), session.creation.id, thumbUrl)
    if (gallery.isOpen) gallery.render(all, thumbUrl)
  }

  async function updateNudge() {
    const [saves, lastExportAt, firstSaveAt] = await Promise.all(
      ['savesSinceExport', 'lastExportAt', 'firstSaveAt'].map(k => lib.getKV(k)))
    const since = lastExportAt ?? firstSaveAt
    const due = saves > 0 && since != null && Date.now() - since > NUDGE_AFTER_MS
    sidebar.setNudge(due ? `${saves} save${saves === 1 ? '' : 's'} since your last backup` : null)
  }

  // --- Open / create ---

  // Opens a creation with its draft. The current draft is written first.
  async function openCreation(id, { safeStart = false } = {}) {
    const seq = ++openSeq
    history.hide()
    await session.flushDraft()
    const creation = await lib.getCreation(id)
    if (!creation) throw new Error(`Creation not found: ${id}`)
    const [version, draft] = await Promise.all([lib.getVersion(creation.headVersionId), lib.getDraft(id)])
    if (seq !== openSeq) return // a later open won
    await session.flushDraft() // edits typed while loading
    if (seq !== openSeq) return
    viewedVersionId = null
    settings.currentCreationId = id
    saveSettings(settings)
    session.open({ creation, version, draft, safeStart })
    await refresh()
  }

  const createFromTemplate = t => lib.createCreation({ name: t.name, mode: templateMode(t), code: t.code })

  async function newFromTemplate(templateId) {
    try {
      const creation = await createFromTemplate(TEMPLATES.find(t => t.id === templateId))
      await openCreation(creation.id)
    } catch (e) { report('Could not create', e) }
  }

  // Opens the most recent live creation, or a new dweet when there is none.
  async function openMostRecent(opts) {
    const [latest] = await lib.listCreations()
    const id = latest?.id ?? (await createFromTemplate(TEMPLATES.find(t => t.id === 'dweet'))).id
    return openCreation(id, opts)
  }

  // --- Save / fork ---

  async function grabThumbnail(background) {
    let bitmap = null
    try {
      bitmap = await session.getRunner()?.grab()
      return bitmap ? await makeThumbnail(bitmap, background) : null
    } catch (e) {
      console.error('Could not make a thumbnail', e)
      return null
    } finally {
      bitmap?.close()
    }
  }

  async function save() {
    const id = session.creation.id
    if (!id) return downloadText() // the in-memory fallback
    if (saving) return
    saving = true
    try {
      const copy = session.workingCopy
      const bg = copy.settings.background
      const thumbnail = await grabThumbnail(bg?.enabled ? bg.color : null)
      await lib.saveVersion(id, { ...copy, thumbnail })
      if (session.creation.id === id) {
        session.markSaved(copy)
        viewedVersionId = null
      }
      if (await lib.getKV('firstSaveAt') == null) await lib.setKV('firstSaveAt', Date.now())
      await refresh()
      await updateNudge()
    } catch (e) {
      report('Could not save', e)
    } finally {
      saving = false
    }
  }

  // Fork button (R20): a new creation whose v1 is the editor's current contents,
  // unsaved edits included. Its parent version is the one viewed, or the head.
  async function forkCurrent() {
    const id = session.creation.id
    if (!id) return
    try {
      const parent = await lib.getCreation(id)
      const creation = await lib.createCreation({
        ...session.workingCopy,
        name: `${session.creation.name} fork`,
        parentId: id,
        parentVersionId: viewedVersionId ?? parent?.headVersionId ?? null,
      })
      await openCreation(creation.id)
    } catch (e) { report('Could not fork', e) }
  }

  // History -> Fork: a new creation from that saved version.
  async function forkVersion(versionId) {
    try {
      const creation = await lib.fork(session.creation.id, versionId)
      await openCreation(creation.id)
    } catch (e) { report('Could not fork', e) }
  }

  async function showHistory() {
    if (history.isOpen) return history.hide()
    const id = session.creation.id
    if (!id) return
    try {
      const [creation, versions] = await Promise.all([lib.getCreation(id), lib.listVersions(id)])
      history.show(versions, { headId: creation?.headVersionId, viewedId: viewedVersionId })
    } catch (e) { report('Could not load the history', e) }
  }

  // --- Delete ---

  async function deleteCreation(id) {
    try {
      const creation = await lib.getCreation(id)
      if (!creation || !confirm(`Delete "${creation.name}"? You can restore it from Show all.`)) return
      const isCurrent = id === session.creation.id
      if (isCurrent) await session.flushDraft()
      await lib.deleteCreation(id)
      if (isCurrent) await openMostRecent()
      else await refresh()
    } catch (e) { report('Could not delete', e) }
  }

  async function purgeCreation(id) {
    try {
      const creation = await lib.getCreation(id)
      if (!creation || !confirm(`Delete "${creation.name}" and all its versions forever? This cannot be undone.`)) return
      await lib.purgeCreation(id)
      await refresh()
    } catch (e) { report('Could not delete', e) }
  }

  // --- Backup ---

  async function exportAll() {
    try {
      const data = await exportLibrary(lib)
      downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), backupFileName(Date.now()))
      await updateNudge()
    } catch (e) { report('Export failed', e) }
  }

  // Every file is sorted by content (R21): JSON with format 'capjs-library' is a backup
  // to merge; any other text becomes one creation; binary files are refused.
  async function importFiles(files) {
    const texts = []
    for (const file of files) {
      try {
        const text = await file.text()
        let data = null
        try { data = JSON.parse(text) } catch { /* not JSON: a program */ }
        if (data?.format === BACKUP_FORMAT) {
          const r = await importLibrary(lib, data)
          alert(`Imported ${file.name}: ${r.addedCreations} new creations, ${r.addedVersions} new versions, ${r.skipped} skipped.`)
        } else if (text.includes('\0')) {
          alert(`Could not import ${file.name}: it is neither a CapJS library backup nor a text file.`)
        } else {
          texts.push({ name: file.name, text })
        }
      } catch (e) {
        alert(`Could not import ${file.name}: ${e.message}`)
      }
    }
    try {
      if (texts.length) await importTextFiles(lib, texts)
      await refresh()
    } catch (e) { report('Import failed', e) }
  }

  return {
    actions: { save, fork: forkCurrent, history: showHistory },

    // Opens the shared program as a new creation, else the last open creation
    // (or the most recent; or a new dweet), restoring its draft. Page code waits for a click.
    // If that fails, an in-memory creation keeps the app usable.
    async boot(shared) {
      $('sidebar').hidden = false
      try {
        const start = sharedStart(shared)
        const last = settings.currentCreationId && await lib.getCreation(settings.currentCreationId)
        if (start) {
          const creation = await lib.createCreation({ name: start.name, mode: sharedMode(start), code: start.code })
          await openCreation(creation.id, { safeStart: true })
        } else if (last && last.deletedAt == null) {
          await openCreation(last.id, { safeStart: true })
        } else {
          await openMostRecent({ safeStart: true })
        }
        await updateNudge()
      } catch (e) {
        console.error('Could not open a creation from the library', e)
        openInMemory(shared)
      }
    },
  }
}

// A share link's program as {name, mode, code}, or null.
const sharedStart = shared => shared && { name: shared.name || 'shared', mode: shared.mode, code: shared.code }

// Templates start in auto, except js, which is never auto-detected (R19).
const templateMode = t => t.mode === 'js' ? 'js' : 'auto'

// A share link's mode: auto when detection already picks it, so later edits keep detecting.
function sharedMode({ mode, code }) {
  if (!MODES.includes(mode)) return 'auto'
  return detectMode(code) === mode ? 'auto' : mode
}
