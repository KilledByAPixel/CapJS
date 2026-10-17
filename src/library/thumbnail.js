// Library thumbnails: the current frame scaled down to a small WebP.

import { composeFrame } from '../capture/aspect.js'

export const THUMB_WIDTH = 160
export const THUMB_HEIGHT = 90

// `background` is a CSS color drawn behind the frame, or null for none.
export function makeThumbnail(bitmap, background) {
  const canvas = new OffscreenCanvas(THUMB_WIDTH, THUMB_HEIGHT)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  composeFrame(ctx, bitmap, { dstW: THUMB_WIDTH, dstH: THUMB_HEIGHT, aspect: 'fill', background })
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })
}
