// Measures how much of a frame is drawn on: used by tests and by the app to spot blank frames.

// Fraction of pixels, after scaling the bitmap to w×h, that are non-transparent
// (alpha > 0) and non-white (any channel < 250). A null bitmap has no ink.
export async function inkFraction(bitmap, w = 32, h = 18) {
  if (!bitmap) return 0
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  let ink = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250)) ink++
  }
  return ink / (w * h)
}
