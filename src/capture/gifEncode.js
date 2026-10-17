// GIF encoding with one global palette for the whole animation (no per-frame
// palettes, so no flicker), optional dithering, and unchanged pixels written as
// transparent to shrink the file. Pure functions; gifWorker.js runs encodeGif.

import { GIFEncoder, quantize, nearestColorIndex } from 'gifenc'
import { gifDelays } from './schedule.js'

const MAX_SAMPLE_PIXELS = 500_000
export const TRANSPARENT_INDEX = 255

const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]
const BAYER_STRENGTH = 24

// Samples at most MAX_SAMPLE_PIXELS pixels evenly across all frames and quantizes them.
export function buildGlobalPalette(frames, maxColors = 255) {
  const total = frames.reduce((n, f) => n + f.length / 4, 0)
  const n = Math.min(total, MAX_SAMPLE_PIXELS)
  const sample = new Uint8ClampedArray(n * 4)
  let frame = 0, start = 0 // the frame holding global pixel `g`, and its first global pixel
  for (let s = 0; s < n; s++) {
    const g = Math.floor(s * total / n)
    while (g >= start + frames[frame].length / 4) start += frames[frame++].length / 4
    const i = (g - start) * 4
    sample.set(frames[frame].subarray(i, i + 4), s * 4)
  }
  return quantize(sample, maxColors, { format: 'rgb565' })
}

const clamp = v => v < 0 ? 0 : v > 255 ? 255 : Math.round(v)

// The nearest palette index for a color, cached by its rgb565 bin. The lookup uses
// the bin's own color, so the result never depends on which pixel filled the cache.
function lookup(palette, cache, r, g, b) {
  const key = (r >> 3) << 11 | (g >> 2) << 5 | b >> 3
  let index = cache.get(key)
  if (index === undefined) {
    const r5 = r >> 3, g6 = g >> 2, b5 = b >> 3
    index = nearestColorIndex(palette, [r5 << 3 | r5 >> 2, g6 << 2 | g6 >> 4, b5 << 3 | b5 >> 2])
    cache.set(key, index)
  }
  return index
}

// Maps RGBA pixels to palette indices. Alpha is ignored. `dither` is 'none',
// 'fs' (Floyd–Steinberg error diffusion) or 'bayer' (8×8 ordered).
export function mapFrame(rgba, width, height, palette, dither, cache) {
  const n = width * height
  const out = new Uint8Array(n)
  if (dither === 'fs') {
    const buf = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      buf[i * 3] = rgba[i * 4]; buf[i * 3 + 1] = rgba[i * 4 + 1]; buf[i * 3 + 2] = rgba[i * 4 + 2]
    }
    const spread = (x, y, er, eg, eb, f) => {
      if (x < 0 || x >= width || y >= height) return
      const j = (y * width + x) * 3
      buf[j] += er * f; buf[j + 1] += eg * f; buf[j + 2] += eb * f
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const r = clamp(buf[i * 3]), g = clamp(buf[i * 3 + 1]), b = clamp(buf[i * 3 + 2])
        const index = out[i] = lookup(palette, cache, r, g, b)
        const p = palette[index]
        const er = r - p[0], eg = g - p[1], eb = b - p[2]
        spread(x + 1, y, er, eg, eb, 7 / 16)
        spread(x - 1, y + 1, er, eg, eb, 3 / 16)
        spread(x, y + 1, er, eg, eb, 5 / 16)
        spread(x + 1, y + 1, er, eg, eb, 1 / 16)
      }
    }
  } else if (dither === 'bayer') {
    for (let y = 0; y < height; y++) {
      const row = BAYER8[y & 7]
      for (let x = 0; x < width; x++) {
        const i = y * width + x, d = (row[x & 7] / 64 - 0.5) * BAYER_STRENGTH
        out[i] = lookup(palette, cache, clamp(rgba[i * 4] + d), clamp(rgba[i * 4 + 1] + d), clamp(rgba[i * 4 + 2] + d))
      }
    }
  } else {
    for (let i = 0; i < n; i++) out[i] = lookup(palette, cache, rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])
  }
  return out
}

// A copy of `indices` where pixels equal to the previous frame's become `transparentIndex`.
export function markUnchanged(indices, prev, transparentIndex) {
  const out = Uint8Array.from(indices)
  for (let i = 0; i < out.length; i++) if (out[i] === prev[i]) out[i] = transparentIndex
  return out
}

// Encodes RGBA frames as a looping GIF: 255 colors plus a transparent index 255, in
// one global color table. Later frames only draw the pixels that changed (dispose 1
// keeps the previous frame underneath). `onProgress(fraction)` follows each frame.
export function encodeGif(frames, width, height, { fps, dither = 'fs', onProgress } = {}) {
  const palette = buildGlobalPalette(frames, TRANSPARENT_INDEX)
  const padded = [...palette]
  while (padded.length < 256) padded.push([0, 0, 0])
  const delays = gifDelays(fps, frames.length)
  const cache = new Map()
  const gif = GIFEncoder()
  let prev = null
  frames.forEach((frame, i) => {
    const indices = mapFrame(frame, width, height, palette, dither, cache)
    if (i === 0) gif.writeFrame(indices, width, height, { palette: padded, delay: delays[i], repeat: 0 })
    else {
      gif.writeFrame(markUnchanged(indices, prev, TRANSPARENT_INDEX), width, height,
        { delay: delays[i], transparent: true, transparentIndex: TRANSPARENT_INDEX, dispose: 1 })
    }
    prev = indices
    onProgress?.((i + 1) / frames.length)
  })
  gif.finish()
  return gif.bytes()
}
