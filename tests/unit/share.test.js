import { test, expect } from 'vitest'
import { buildShareUrl, parseShareUrl } from '../../src/code/share.js'

const dweet = 'c.width|=0\nfor(i=1e3;i--;)\nx.fillRect(960+900*S(i*2),540+500*C(t*PI/2+i*3),29,29)'

test('share URL round trip carries name, mode and code in one compressed param', async () => {
  const url = await buildShareUrl('https://x.github.io/CapJS/#old', { name: 'spiral', mode: 'dweet', code: dweet })
  const u = new URL(url)
  expect([...u.searchParams.keys()]).toEqual(['s'])
  expect(u.hash).toBe('')
  expect(await parseShareUrl(url)).toEqual({ name: 'spiral', mode: 'dweet', code: dweet })
})
test('auto mode comes back as null; quotes, newlines and unicode survive', async () => {
  const code = 'fillStyle=`hsl(${i&&210} 99% ${99-j}%`\ns="█ \'q\' & ü"'
  expect(await parseShareUrl(await buildShareUrl('https://a/', { name: 'n', mode: 'auto', code })))
    .toEqual({ name: 'n', mode: null, code })
})
test('no share params, or a damaged one, gives null', async () => {
  expect(await parseShareUrl('https://a/')).toBeNull()
  expect(await parseShareUrl('https://a/?s=not-a-real-payload')).toBeNull()
})
