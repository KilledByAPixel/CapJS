// Maps a source frame (the canvas) onto a destination size (a capture or thumbnail)
// by aspect mode: fill (cover), fit (contain), center (native size) or stretch.

export const ASPECTS = ['fill', 'fit', 'center', 'stretch']

// The rectangle, in destination pixels, to draw the source into. It may extend
// past the destination (fill, center), which then crops it.
export function computeDrawRect(srcW, srcH, dstW, dstH, aspect) {
  let scale
  if (aspect === 'stretch') return { x: 0, y: 0, w: dstW, h: dstH }
  else if (aspect === 'fill') scale = Math.max(dstW / srcW, dstH / srcH)
  else if (aspect === 'fit') scale = Math.min(dstW / srcW, dstH / srcH)
  else if (aspect === 'center') scale = 1
  else throw new Error(`Unknown aspect: ${aspect}`)
  const w = srcW * scale, h = srcH * scale
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h }
}

// Clears the context, fills the background color when it is non-null, then draws
// the bitmap at the aspect rectangle.
export function composeFrame(ctx2d, bitmap, { dstW, dstH, aspect, background = null }) {
  ctx2d.clearRect(0, 0, dstW, dstH)
  if (background != null) {
    ctx2d.fillStyle = background
    ctx2d.fillRect(0, 0, dstW, dstH)
  }
  const r = computeDrawRect(bitmap.width, bitmap.height, dstW, dstH, aspect)
  ctx2d.drawImage(bitmap, r.x, r.y, r.w, r.h)
}
