import { test, expect } from 'vitest'
import { buildShareUrl, parseShareUrl } from '../../src/code/share.js'
test('share URL round trip', () => {
  const url = buildShareUrl('https://x.github.io/CapJS/', { name: 'spiral', mode: 'dweet', code: 'x.fillRect(0,0,9,9)' })
  expect(parseShareUrl(url)).toEqual({ name: 'spiral', mode: 'dweet', code: 'x.fillRect(0,0,9,9)' })
})
test('auto mode is omitted, old ?code= links load, no params → null', () => {
  expect(new URL(buildShareUrl('https://a/', { name: 'n', mode: 'auto', code: 'a' })).searchParams.has('mode')).toBe(false)
  expect(parseShareUrl('https://a/?code=abc').code).toBe('abc')
  expect(parseShareUrl('https://a/')).toBeNull()
})
