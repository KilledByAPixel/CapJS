import { test, expect } from 'vitest'
import { buildGlobalPalette, mapFrame, markUnchanged, encodeGif } from '../../src/capture/gifEncode.js'
import { parseGif } from '../helpers/gifParse.js'
const solid = (w, h, f) => { const a = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) a.set([...f(i % w, (i / w) | 0), 255], i * 4); return a }
const W = 16, H = 8
const f1 = solid(W, H, x => x < 8 ? [255, 0, 0] : [0, 0, 255])
const f2 = solid(W, H, (x, y) => x === 0 && y === 0 ? [0, 255, 0] : x < 8 ? [255, 0, 0] : [0, 0, 255])

test('one global palette for all frames, no local tables, loops forever', () => {
  const gif = parseGif(encodeGif([f1, f2], W, H, { fps: 50, dither: 'none' }))
  expect(gif.header).toBe('GIF89a')
  expect(gif.globalColorTable).toBe(true)
  expect(gif.frames).toHaveLength(2)
  expect(gif.frames.every(f => !f.localColorTable)).toBe(true)
  expect(gif.frames.map(f => f.delayCs)).toEqual([2, 2])
  expect(gif.loopCount).toBe(0)
})
test('palette contains the colors of every frame', () => {
  const pal = buildGlobalPalette([f1, f2])
  for (const c of [[255, 0, 0], [0, 0, 255], [0, 255, 0]])
    expect(pal.some(p => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) < 24), String(c)).toBe(true)
})
test('unchanged pixels become transparent', () => {
  expect([...markUnchanged(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 9, 3]), 255)]).toEqual([255, 2, 255])
})
test('dithering modes are deterministic and produce valid indices', () => {
  const grad = solid(W, H, x => [x * 16, x * 16, x * 16])
  const pal = [[0, 0, 0], [255, 255, 255]]
  for (const d of ['none', 'fs', 'bayer']) {
    const a = mapFrame(grad, W, H, pal, d, new Map()), b = mapFrame(grad, W, H, pal, d, new Map())
    expect([...a]).toEqual([...b]); expect(a.every(i => i < 2)).toBe(true)
  }
  expect(new Set(mapFrame(grad, W, H, pal, 'fs', new Map()).slice(4, 12)).size).toBe(2)
})
