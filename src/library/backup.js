// Library backup: export to a JSON-safe object and merge-import it back.

const FORMAT = 'capjs-library'

// FileReader does not exist in Node, so encode via arrayBuffer/btoa (works in browsers too).
const blobToDataUrl = async blob => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`
}
const dataUrlToBlob = async url => (await fetch(url)).blob()

export async function exportLibrary(lib) {
  const creations = await lib.listCreations()
  const live = new Set(creations.map(c => c.id))
  const versions = (await lib.raw.getAll('versions')).filter(v => live.has(v.creationId))
  const tombstones = await lib.listTombstones()
  const out = []
  for (const c of creations) {
    out.push({ ...c, thumbnail: c.thumbnail instanceof Blob ? await blobToDataUrl(c.thumbnail) : null })
  }
  const exportedAt = Date.now()
  await lib.runExclusive(async () => {
    await lib.raw.put('kv', { key: 'lastExportAt', value: exportedAt })
    await lib.raw.put('kv', { key: 'savesSinceExport', value: 0 })
  })
  return { format: FORMAT, version: 1, exportedAt, creations: out, versions, tombstones }
}

export async function importLibrary(lib, data) {
  if (!data || data.format !== FORMAT || !Array.isArray(data.creations) || !Array.isArray(data.versions)) {
    throw new Error('Not a CapJS library file')
  }
  const incomingTombstones = Array.isArray(data.tombstones) ? data.tombstones : []
  // Decode thumbnails up front so the exclusive section is only IndexedDB work.
  const thumbs = new Map()
  for (const c of data.creations) {
    if (typeof c?.thumbnail === 'string') thumbs.set(c.id, await dataUrlToBlob(c.thumbnail))
  }
  const byCreation = new Map()
  for (const v of data.versions) {
    if (!byCreation.has(v.creationId)) byCreation.set(v.creationId, [])
    byCreation.get(v.creationId).push(v)
  }

  return lib.runExclusive(async () => {
    const { raw } = lib
    const local = new Map((await raw.getAll('creations')).map(c => [c.id, c]))
    const dead = new Set((await raw.getAll('tombstones')).map(t => t.id))
    for (const c of local.values()) if (c.deletedAt != null) dead.add(c.id)
    const result = { addedCreations: 0, addedVersions: 0, skipped: 0 }

    for (const t of incomingTombstones) {
      if (!local.has(t.id) && !dead.has(t.id)) {
        await raw.put('tombstones', { id: t.id, deletedAt: t.deletedAt })
        dead.add(t.id)
      }
    }

    for (const inc of data.creations) {
      const incVersions = byCreation.get(inc.id) ?? []
      if (dead.has(inc.id)) { result.skipped++; continue }
      const thumb = thumbs.get(inc.id) ?? null
      const existing = local.get(inc.id)
      if (!existing) {
        for (const v of incVersions) await raw.put('versions', v)
        await raw.put('creations', { ...inc, thumbnail: thumb })
        result.addedCreations++
        result.addedVersions += incVersions.length
        continue
      }
      const have = new Set((await raw.getAllByIndex('versions', 'creationId', inc.id)).map(v => v.id))
      const fresh = incVersions.filter(v => !have.has(v.id))
      if (!fresh.length) { result.skipped++; continue }
      for (const v of fresh) await raw.put('versions', v)
      const all = (await raw.getAllByIndex('versions', 'creationId', inc.id))
        .sort((a, b) => a.createdAt - b.createdAt || a.n - b.n)
      for (let i = 0; i < all.length; i++) {
        if (all[i].n !== i + 1) await raw.put('versions', { ...all[i], n: i + 1 })
      }
      await raw.put('creations', {
        ...existing,
        headVersionId: all[all.length - 1].id,
        versionCount: all.length,
        updatedAt: Math.max(existing.updatedAt, inc.updatedAt ?? 0),
        thumbnail: thumb && (inc.updatedAt ?? 0) > existing.updatedAt ? thumb : existing.thumbnail,
      })
      result.addedVersions += fresh.length
    }
    return result
  })
}

export function backupFileName(now) {
  const d = new Date(now)
  const p = n => String(n).padStart(2, '0')
  return `capjs-library-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}
