import 'fake-indexeddb/auto'
import { test, expect } from 'vitest'
import { openLibrary } from '../../src/library/library.js'
import { exportLibrary, importLibrary, backupFileName } from '../../src/library/backup.js'
let n = 0, clock = 1000
const open = () => openLibrary({ dbName: 'bk' + n++, now: () => clock++ })
const base = { name: 's', mode: 'dweet', code: 'a' }
const save = (lib, c, code, thumbnail = null) => lib.saveVersion(c.id, { code, mode: 'dweet', runMode: 'auto', settings: c.settings, thumbnail })

test('export → import into an empty library recreates everything; re-import is a no-op', async () => {
  const a = await open(); const c = await a.createCreation(base); await save(a, c, 'b')
  const file = JSON.parse(JSON.stringify(await exportLibrary(a)))
  const b = await open()
  expect(await importLibrary(b, file)).toEqual({ addedCreations: 1, addedVersions: 2, skipped: 0 })
  expect(await importLibrary(b, file)).toEqual({ addedCreations: 0, addedVersions: 0, skipped: 1 })
  expect((await b.listVersions(c.id)).map(v => [v.n, v.code])).toEqual([[2, 'b'], [1, 'a']])
})
test('merge adds newer versions from the backup and moves head', async () => {
  const a = await open(); const c = await a.createCreation(base)
  const b = await open(); await importLibrary(b, await exportLibrary(a))
  const v = await save(a, c, 'newer')
  expect((await importLibrary(b, await exportLibrary(a))).addedVersions).toBe(1)
  const merged = await b.getCreation(c.id)
  expect(merged.headVersionId).toBe(v.id)
  expect(merged.versionCount).toBe(2)
})
test('divergent versions interleave by createdAt and renumber', async () => {
  const a = await open(); const c = await a.createCreation(base)
  const b = await open(); await importLibrary(b, await exportLibrary(a))
  await save(a, c, 'from-a')
  await b.saveVersion(c.id, { code: 'from-b', mode: 'dweet', runMode: 'auto', settings: c.settings, thumbnail: null })
  await importLibrary(b, await exportLibrary(a))
  const vs = await b.listVersions(c.id)
  expect(vs.map(v => v.n)).toEqual([3, 2, 1])
  expect(vs.map(v => v.code)).toEqual(['from-b', 'from-a', 'a'])
  expect((await b.getCreation(c.id)).headVersionId).toBe(vs[0].id)
})
test('thumbnails round-trip through data URLs', async () => {
  const a = await open(); const c = await a.createCreation(base)
  await save(a, c, 'b', new Blob(['PNGDATA'], { type: 'image/png' }))
  const file = JSON.parse(JSON.stringify(await exportLibrary(a)))
  expect(file.creations[0].thumbnail).toMatch(/^data:image\/png;base64,/)
  const b = await open(); await importLibrary(b, file)
  const t = (await b.getCreation(c.id)).thumbnail
  expect(t).toBeInstanceOf(Blob)
  expect(await t.text()).toBe('PNGDATA')
})
test('deleted creations never come back from an older backup', async () => {
  const a = await open(); const c = await a.createCreation(base)
  const old = await exportLibrary(a)
  await a.deleteCreation(c.id)
  expect((await importLibrary(a, old)).addedCreations).toBe(0)
  expect(await a.listCreations()).toHaveLength(0)
  expect((await exportLibrary(a)).tombstones.map(t => t.id)).toEqual([c.id])
})
test('incoming tombstones are stored but never delete live creations', async () => {
  const a = await open(); const c = await a.createCreation(base)
  const b = await open(); const live = await b.createCreation(base)
  await a.deleteCreation(c.id)
  const file = await exportLibrary(a)
  file.tombstones.push({ id: live.id, deletedAt: 5 })
  await importLibrary(b, file)
  expect((await b.listTombstones()).map(t => t.id)).toEqual([c.id])
  expect((await b.listCreations()).map(x => x.id)).toEqual([live.id])
})
test('garbage input throws and writes nothing', async () => {
  const a = await open()
  for (const bad of [null, {}, { format: 'other' }, { format: 'capjs-library', creations: 'x', versions: [] }])
    await expect(importLibrary(a, bad)).rejects.toThrow('Not a CapJS library file')
  expect(await a.listCreations({ includeDeleted: true })).toHaveLength(0)
})
test('export resets backup counters; file name', async () => {
  const a = await open(); const c = await a.createCreation(base); await save(a, c, 'b')
  expect(await a.getKV('savesSinceExport')).toBe(1)
  await exportLibrary(a)
  expect(await a.getKV('savesSinceExport')).toBe(0)
  expect(typeof await a.getKV('lastExportAt')).toBe('number')
  expect(backupFileName(new Date(2026, 9, 16, 12).getTime())).toBe('capjs-library-2026-10-16.json')
})
test('merge moving head copies mode, runMode and settings from the new head', async () => {
  const a = await open(); const c = await a.createCreation(base)
  const b = await open(); await importLibrary(b, await exportLibrary(a))
  const settings = { ...c.settings, canvasWidth: 640 }
  await a.saveVersion(c.id, { code: 'g', mode: 'js', runMode: 'page', settings, thumbnail: null })
  await importLibrary(b, await exportLibrary(a))
  const m = await b.getCreation(c.id)
  expect([m.mode, m.runMode, m.settings.canvasWidth]).toEqual(['js', 'page', 640])
})
test('a malformed element anywhere means nothing is written', async () => {
  const a = await open(); const c = await a.createCreation(base)
  const file = await exportLibrary(a)
  const b = await open()
  const other = { ...file.creations[0], id: 'other' }
  await expect(importLibrary(b, { ...file, creations: [file.creations[0], null] })).rejects.toThrow('Not a CapJS library file')
  await expect(importLibrary(b, { ...file, creations: [file.creations[0], other], versions: [...file.versions, { id: 'v' }] })).rejects.toThrow('Not a CapJS library file')
  expect(await b.listCreations({ includeDeleted: true })).toHaveLength(0)
  expect(await b.raw.getAll('versions')).toHaveLength(0)
})
test('creations need a name, an updatedAt and a head among their versions', async () => {
  const a = await open(); const c = await a.createCreation(base)
  const file = JSON.parse(JSON.stringify(await exportLibrary(a)))
  const b = await open()
  const withCreation = patch => ({ ...file, creations: [{ ...file.creations[0], ...patch }] })
  for (const patch of [{ name: 7 }, { name: undefined }, { updatedAt: '1' }, { headVersionId: 'nope' }, { headVersionId: 3 }])
    await expect(importLibrary(b, withCreation(patch)), JSON.stringify(patch)).rejects.toThrow('Not a CapJS library file')
  // A head that belongs to another creation's versions is not this creation's head.
  const other = await a.createCreation({ ...base, name: 'other' })
  const two = JSON.parse(JSON.stringify(await exportLibrary(a)))
  const swapped = two.creations.map(x => x.id === c.id ? { ...x, headVersionId: other.headVersionId } : x)
  await expect(importLibrary(b, { ...two, creations: swapped })).rejects.toThrow('Not a CapJS library file')
  expect(await b.listCreations({ includeDeleted: true })).toHaveLength(0)
  expect(await b.raw.getAll('versions')).toHaveLength(0)
})
test('when merging, a head may be one of the local versions', async () => {
  const a = await open(); const c = await a.createCreation(base)
  const b = await open(); await importLibrary(b, await exportLibrary(a))
  await save(a, c, 'newer')
  const file = JSON.parse(JSON.stringify(await exportLibrary(a)))
  const v1 = file.versions.find(v => v.n === 1)
  // Only the new version is in the file, and the head points at the local v1.
  const partial = { ...file, creations: [{ ...file.creations[0], headVersionId: v1.id }], versions: file.versions.filter(v => v.n === 2) }
  expect((await importLibrary(b, partial)).addedVersions).toBe(1)
})
