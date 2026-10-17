// Low-level IndexedDB helpers for the CapJS library.

export function openDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore('creations', { keyPath: 'id' })
      db.createObjectStore('versions', { keyPath: 'id' }).createIndex('creationId', 'creationId')
      db.createObjectStore('drafts', { keyPath: 'creationId' })
      db.createObjectStore('tombstones', { keyPath: 'id' })
      db.createObjectStore('kv', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const wrap = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

const store = (db, name, mode) => db.transaction(name, mode).objectStore(name)

export const get = async (db, name, key) => (await wrap(store(db, name, 'readonly').get(key))) ?? null
export const put = async (db, name, value) => { await wrap(store(db, name, 'readwrite').put(value)) }
export const del = async (db, name, key) => { await wrap(store(db, name, 'readwrite').delete(key)) }
export const getAll = (db, name) => wrap(store(db, name, 'readonly').getAll())
export const getAllByIndex = (db, name, index, key) =>
  wrap(store(db, name, 'readonly').index(index).getAll(key))

// Run fn(stores) inside one readwrite transaction over several stores; resolves
// once the transaction commits. fn must only issue IDB requests synchronously.
// With `commit`, the transaction is committed explicitly right after fn, which
// lets it finish even if the page unloads before the requests' callbacks run.
export function transact(db, names, fn, { commit = false } = {}) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite')
    const stores = Object.fromEntries(names.map(n => [n, tx.objectStore(n)]))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
    try { fn(stores) } catch (e) { tx.abort(); reject(e); return }
    if (commit) tx.commit?.()
  })
}
