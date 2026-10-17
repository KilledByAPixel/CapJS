import { openDb, get, put, del, getAll, getAllByIndex, transact } from './db.js'

export const DEFAULT_CREATION_SETTINGS = {
  canvasWidth: 1920,
  canvasHeight: 1080,
  background: { enabled: true, color: '#ffffff' },
}

export async function openLibrary({ dbName = 'capjs', now = Date.now } = {}) {
  const db = await openDb(dbName)
  const id = () => crypto.randomUUID()
  const clone = v => structuredClone(v)
  let persistRequested = false

  const requireRecord = async (store, key) => {
    const rec = await get(db, store, key)
    if (!rec) throw new Error(`${store} record not found: ${key}`)
    return rec
  }

  const raw = {
    get: (store, key) => get(db, store, key),
    put: (store, value) => put(db, store, value),
    del: (store, key) => del(db, store, key),
    getAll: store => getAll(db, store),
    getAllByIndex: (store, index, key) => getAllByIndex(db, store, index, key),
  }

  const getKV = async key => (await get(db, 'kv', key))?.value ?? null
  const setKV = (key, value) => put(db, 'kv', { key, value })

  const getCreation = key => get(db, 'creations', key)
  const getVersion = key => get(db, 'versions', key)
  const getDraft = key => get(db, 'drafts', key)

  async function listVersions(creationId) {
    const all = await getAllByIndex(db, 'versions', 'creationId', creationId)
    return all.sort((a, b) => b.n - a.n)
  }

  async function createCreation({
    name, mode, runMode = 'auto', settings = DEFAULT_CREATION_SETTINGS, code,
    parentId = null, parentVersionId = null,
  }) {
    const t = now()
    const version = {
      id: id(), creationId: id(), n: 1, code, mode, runMode, settings: clone(settings), createdAt: t,
    }
    const creation = {
      id: version.creationId, name, mode, runMode, settings: clone(settings),
      parentId, parentVersionId, createdAt: t, updatedAt: t,
      headVersionId: version.id, versionCount: 1, thumbnail: null, deletedAt: null,
    }
    await transact(db, ['creations', 'versions'], s => {
      s.creations.put(creation)
      s.versions.put(version)
    })
    return creation
  }

  async function saveVersion(creationId, { code, mode, runMode, settings, thumbnail }) {
    if (!persistRequested) {
      persistRequested = true
      try { navigator.storage?.persist?.()?.catch?.(() => {}) } catch { /* unsupported */ }
    }
    const creation = await requireRecord('creations', creationId)
    const t = now()
    const version = {
      id: id(), creationId, n: creation.versionCount + 1, code, mode, runMode,
      settings: clone(settings), createdAt: t,
    }
    const saves = (await getKV('savesSinceExport')) ?? 0
    const updated = {
      ...creation, mode, runMode, settings: clone(settings),
      headVersionId: version.id, versionCount: version.n, updatedAt: t,
      thumbnail: thumbnail instanceof Blob ? thumbnail : creation.thumbnail,
    }
    await transact(db, ['creations', 'versions', 'drafts', 'kv'], s => {
      s.versions.put(version)
      s.creations.put(updated)
      s.drafts.delete(creationId)
      s.kv.put({ key: 'savesSinceExport', value: saves + 1 })
    })
    return version
  }

  async function fork(creationId, versionId) {
    const parent = await requireRecord('creations', creationId)
    const v = await requireRecord('versions', versionId ?? parent.headVersionId)
    return createCreation({
      name: `${parent.name} fork`, mode: v.mode, runMode: v.runMode, settings: v.settings,
      code: v.code, parentId: creationId, parentVersionId: v.id,
    })
  }

  async function rename(key, name) {
    const c = await requireRecord('creations', key)
    await put(db, 'creations', { ...c, name, updatedAt: now() })
  }

  const setDraft = (creationId, { code, mode, runMode, settings }) =>
    put(db, 'drafts', { creationId, code, mode, runMode, settings: clone(settings), updatedAt: now() })
  const discardDraft = creationId => del(db, 'drafts', creationId)

  async function listCreations({ includeDeleted = false } = {}) {
    const all = await getAll(db, 'creations')
    return all
      .filter(c => includeDeleted || c.deletedAt == null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async function deleteCreation(key) {
    const c = await requireRecord('creations', key)
    await put(db, 'creations', { ...c, deletedAt: now() })
  }

  async function restoreCreation(key) {
    const c = await requireRecord('creations', key)
    await put(db, 'creations', { ...c, deletedAt: null, updatedAt: now() })
  }

  async function purgeCreation(key) {
    const c = await getCreation(key)
    const versions = await getAllByIndex(db, 'versions', 'creationId', key)
    const tombstone = { id: key, deletedAt: c?.deletedAt ?? now() }
    await transact(db, ['creations', 'versions', 'drafts', 'tombstones'], s => {
      for (const v of versions) s.versions.delete(v.id)
      s.creations.delete(key)
      s.drafts.delete(key)
      s.tombstones.put(tombstone)
    })
  }

  async function listTombstones() {
    const soft = (await getAll(db, 'creations'))
      .filter(c => c.deletedAt != null)
      .map(c => ({ id: c.id, deletedAt: c.deletedAt }))
    const purged = await getAll(db, 'tombstones')
    return [...soft, ...purged.map(t => ({ id: t.id, deletedAt: t.deletedAt }))]
  }

  return {
    listCreations, getCreation, createCreation, saveVersion, listVersions, getVersion,
    fork, rename, setDraft, getDraft, discardDraft,
    deleteCreation, restoreCreation, purgeCreation, listTombstones,
    getKV, setKV, raw,
  }
}
