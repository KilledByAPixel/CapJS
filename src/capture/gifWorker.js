// Encodes a GIF off the main thread.
// In: {frames: Uint8ClampedArray[] (transferred), width, height, fps, dither}.
// Out: {type:'progress', fraction}, then {type:'done', bytes} (transferred) or {type:'error', message}.

import { encodeGif } from './gifEncode.js'

self.onmessage = ({ data: { frames, width, height, fps, dither } }) => {
  try {
    const bytes = encodeGif(frames, width, height, {
      fps, dither, onProgress: fraction => self.postMessage({ type: 'progress', fraction }),
    })
    self.postMessage({ type: 'done', bytes }, [bytes.buffer])
  } catch (e) {
    self.postMessage({ type: 'error', message: e?.message ?? String(e) })
  }
}
