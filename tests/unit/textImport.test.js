import 'fake-indexeddb/auto'
import { test, expect } from 'vitest'
import { openLibrary } from '../../src/library/library.js'
import { importTextFiles } from '../../src/library/textImport.js'
import { TEMPLATES } from '../../src/library/templates.js'
test('each text file becomes a creation named after the file', async () => {
  const lib = await openLibrary({ dbName: 'txt' })
  const made = await importTextFiles(lib, [{ name: 'spiral v3.txt', text: 'x.fillRect(0,0,9,9)' }, { name: 'sky.js', text: 'a' }])
  expect(made.map(c => c.name)).toEqual(['spiral v3', 'sky'])
  expect(made[0].mode).toBe('auto')
  expect((await lib.listVersions(made[0].id))[0].code).toBe('x.fillRect(0,0,9,9)')
})
test('templates cover every mode except auto', () => {
  expect(TEMPLATES.map(t => t.id)).toEqual(['dweet', 'js', 'html', 'three', 'shadertoy', 'littlejs'])
  for (const t of TEMPLATES) expect(t.code.split('\n')[0]).toMatch(/^(\/\/|<!--)/)
  expect(TEMPLATES.map(t => t.mode)).toEqual(['dweet', 'dweet', 'js', 'html', 'three', 'shadertoy', 'littlejs'])
})
