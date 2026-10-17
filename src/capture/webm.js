// WebM (VP9) encoding of captured frames with WebCodecs and webm-muxer.

import { Muxer, ArrayBufferTarget } from 'webm-muxer'

const CODEC = 'vp09.00.10.08'
const KEYFRAME_SECONDS = 2
const MAX_QUEUE = 8 // frames waiting in the encoder before we wait for it

// `frames` are ImageBitmaps or ImageData. VP9 needs even sizes, so width and
// height are rounded down (the frames are cropped by a pixel when odd).
export async function encodeWebm(frames, width, height, fps) {
  if (typeof VideoEncoder === 'undefined') throw new Error('This browser cannot encode video (no WebCodecs).')
  const w = width & ~1, h = height & ~1
  const config = { codec: CODEC, width: w, height: h, framerate: fps, bitrate: Math.round(w * h * fps * 0.2) }
  if (!(await VideoEncoder.isConfigSupported(config)).supported) throw new Error(`This browser cannot encode VP9 video at ${w}×${h}.`)

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({ target, video: { codec: 'V_VP9', width: w, height: h, frameRate: fps } })
  let failure = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { failure = e },
  })
  try {
    encoder.configure(config)
    const duration = 1e6 / fps
    for (let i = 0; i < frames.length; i++) {
      if (failure) throw failure
      while (encoder.encodeQueueSize > MAX_QUEUE) await new Promise(r => encoder.addEventListener('dequeue', r, { once: true }))
      const init = { timestamp: Math.round(i * duration), duration: Math.round(duration), visibleRect: { x: 0, y: 0, width: w, height: h } }
      const f = frames[i]
      const frame = f instanceof ImageData
        ? new VideoFrame(f.data, { ...init, format: 'RGBA', codedWidth: f.width, codedHeight: f.height })
        : new VideoFrame(f, init)
      encoder.encode(frame, { keyFrame: i % Math.round(fps * KEYFRAME_SECONDS) === 0 })
      frame.close()
    }
    await encoder.flush()
    if (failure) throw failure
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
  muxer.finalize()
  return new Blob([target.buffer], { type: 'video/webm' })
}
