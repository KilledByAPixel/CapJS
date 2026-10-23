// Deterministic capture: a dedicated hidden runner steps the program at fixed
// program time, each frame is composed at the capture size, then encoded as a
// GIF (in gifWorker.js) or WebM. The live view is suspended meanwhile, so typing
// or the live loop can't disturb the capture. Also the single-frame screenshot.

import { createRunner, CAPTURE_BUDGET_MS } from '../runner/runner.js'
import { composeFrame } from './aspect.js'
import { captureTargets, estimateCaptureBytes, MAX_CAPTURE_BYTES, GIF_SIZE_LIMIT } from './schedule.js'
import { encodeWebm } from './webm.js'

const backgroundOf = creationSettings => creationSettings.background?.enabled ? creationSettings.background.color : null

// An error the user caused or can fix (too big, a program error): shown, not logged.
function refusal(message) {
  return Object.assign(new Error(message), { expected: true })
}

function abortIfNeeded(signal) {
  if (signal?.aborted) throw refusal('Capture cancelled')
}

// Encodes RGBA frames in a worker; the frames' buffers are transferred (and so emptied).
function encodeGifInWorker(frames, { width, height, fps, dither, onProgress, signal }) {
  const worker = new Worker(new URL('./gifWorker.js', import.meta.url), { type: 'module' })
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(refusal('Capture cancelled'))
    if (signal?.aborted) return onAbort() // an aborted signal never fires 'abort' again
    signal?.addEventListener('abort', onAbort, { once: true })
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress?.(data.fraction)
      else if (data.type === 'done') resolve(data.bytes)
      else reject(new Error(data.message))
    }
    worker.onerror = e => { e.preventDefault(); reject(new Error(e.message || 'GIF encoder failed')) }
    worker.postMessage({ frames, width, height, fps, dither }, frames.map(f => f.buffer))
  }).finally(() => worker.terminate())
}

// Captures the open creation with the capture settings. `onProgress({phase, fraction})`
// reports 'capture' then 'encode'. Rejects with a user-facing message on failure.
export async function runCapture({ session, settings: capture, creationSettings, onProgress, signal }) {
  if (!session.getRunner()?.supportsCapture) throw refusal(`Capture is not available in ${session.concreteMode} mode.`)
  const { format, width, height, seconds, speed, dither, aspect, fps } = capture
  const bytes = estimateCaptureBytes({ width, height, seconds, fps })
  if (bytes > MAX_CAPTURE_BYTES) {
    throw refusal(`This capture needs about ${(bytes / 1e9).toFixed(1)} GB of memory. Try a smaller size, fewer seconds, or a lower FPS.`)
  }

  session.suspendLive(true)
  const code = session.code
  const background = backgroundOf(creationSettings)
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1'
  document.body.append(container)
  let runner = null, raw = null
  const frames = []
  try {
    runner = createRunner({
      container, mode: session.concreteMode, runMode: session.runMode,
      width: creationSettings.canvasWidth, height: creationSettings.canvasHeight, background,
    })
    if (session.image) runner.setImage(session.image) // kept and sent after the load
    const loaded = await runner.load(code, { loopProtect: runner.runMode === 'page' })
    if (loaded.error) throw refusal(loaded.error.message)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: format === 'gif' })
    const targets = captureTargets({ seconds, fps, speed })
    let last = -1 // the last step run
    for (let k = 0; k < targets.length; k++) {
      abortIfNeeded(signal)
      const steps = []
      for (let i = last + 1; i <= targets[k]; i++) steps.push(i)
      if (steps.length) { // otherwise (speed < 1) the previous frame shows again
        const result = await runner.runFrames(steps, { grab: true, budgetMs: CAPTURE_BUDGET_MS })
        if (result.error) throw refusal(result.error.message)
        if (!result.bitmap) throw refusal('The program produced no frame to capture.')
        raw?.close()
        raw = result.bitmap
        last = targets[k]
      }
      composeFrame(ctx, raw, { dstW: width, dstH: height, aspect, background })
      frames.push(format === 'gif' ? ctx.getImageData(0, 0, width, height).data : await createImageBitmap(canvas))
      onProgress?.({ phase: 'capture', fraction: (k + 1) / targets.length })
    }
    abortIfNeeded(signal) // cancelled during the last frame
    runner.destroy() // free it before encoding
    raw?.close()
    raw = null

    const encodeProgress = fraction => onProgress?.({ phase: 'encode', fraction })
    let blob
    if (format === 'gif') {
      const gif = await encodeGifInWorker(frames.splice(0), { width, height, fps, dither, onProgress: encodeProgress, signal })
      blob = new Blob([gif], { type: 'image/gif' })
    } else {
      blob = await encodeWebm(frames, width, height, fps, signal)
    }
    abortIfNeeded(signal) // cancelled as encoding finished
    return { blob, format, bytes: blob.size, overLimit: format === 'gif' && blob.size > GIF_SIZE_LIMIT }
  } finally {
    for (const f of frames) f.close?.()
    raw?.close()
    runner?.destroy()
    container.remove()
    session.suspendLive(false)
  }
}

// The live runner's current frame, composed at the capture size with the capture
// aspect and the creation's background, as a PNG Blob. Null when the mode has no frame.
export async function takeScreenshot({ session, settings: capture }) {
  const bitmap = await session.getRunner()?.grab()
  if (!bitmap) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = capture.width
    canvas.height = capture.height
    composeFrame(canvas.getContext('2d'), bitmap, {
      dstW: capture.width, dstH: capture.height, aspect: capture.aspect, background: backgroundOf(session.creationSettings),
    })
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  } finally {
    bitmap.close()
  }
}
