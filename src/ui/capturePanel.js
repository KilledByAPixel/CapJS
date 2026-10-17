// Capture panel: format, size, seconds, fps, dither, speed and the Capture button
// (which cancels while a capture runs), plus the screenshot button. Settings live in
// settings.capture and persist. A GIF opens in the preview; WebM and PNG download.

import { runCapture, takeScreenshot } from '../capture/capture.js'
import { GIF_MAX_FPS } from '../capture/schedule.js'
import { downloadBlob } from './download.js'

const NUMBERS = { // id suffix -> [settings key, min, max, integer]
  width: ['width', 1, 8192, true],
  height: ['height', 1, 8192, true],
  seconds: ['seconds', 0.1, 600, false],
  speed: ['speed', 0.1, 10, false],
}

export function createCapturePanel({ session, settings, saveSettings, transport, preview }) {
  const $ = id => document.getElementById(id)
  const cap = settings.capture
  const format = $('cap-format'), fps = $('cap-fps'), dither = $('cap-dither'), fpsHint = $('cap-fps-hint')
  const button = $('btn-capture'), progress = $('capture-progress'), message = $('capture-message')
  const buttonLabel = button.textContent
  const numbers = Object.entries(NUMBERS).map(([id, spec]) => [$('cap-' + id), ...spec])

  format.value = cap.format
  fps.value = String(cap.fps)
  dither.value = cap.dither
  for (const [input, key] of numbers) input.value = cap[key]

  function showHints() {
    const gif = cap.format === 'gif'
    for (const el of document.querySelectorAll('.cap-dither-row')) el.hidden = !gif
    fpsHint.hidden = !(gif && cap.fps > GIF_MAX_FPS)
  }
  showHints()

  // Reads the inputs into settings.capture. With `revert`, invalid numbers show the setting again.
  function read({ revert = false } = {}) {
    cap.format = format.value
    cap.fps = Number(fps.value)
    cap.dither = dither.value
    for (const [input, key, min, max, integer] of numbers) {
      const n = integer ? Math.round(Number(input.value)) : Number(input.value)
      if (input.value !== '' && n >= min && n <= max) cap[key] = n
      else if (revert) input.value = cap[key]
    }
    saveSettings(settings)
    showHints()
  }
  for (const el of [format, fps, dither]) el.addEventListener('change', () => read())
  for (const [input] of numbers) {
    input.addEventListener('input', () => read())
    input.addEventListener('change', () => read({ revert: true }))
  }

  const fileName = ext => `${session.creation.name || 'capjs'}.${ext}`
  const showMessage = text => { message.textContent = text ?? '' }

  let running = null // the AbortController of the capture in progress

  async function capture() {
    if (running) return running.abort() // the button cancels a running capture
    read({ revert: true })
    showMessage('')
    running = new AbortController()
    button.textContent = '■ Cancel capture'
    progress.value = 0
    progress.hidden = false
    try {
      const result = await runCapture({
        session, settings: { ...cap }, creationSettings: session.creationSettings, signal: running.signal,
        onProgress({ phase, fraction }) {
          progress.value = phase === 'capture' ? fraction * 0.6 : 0.6 + fraction * 0.4
          progress.title = `${phase === 'capture' ? 'Capturing frames' : 'Encoding'}: ${Math.round(fraction * 100)}%`
        },
      })
      if (result.format === 'gif') preview.open({ blob: result.blob, overLimit: result.overLimit, filename: fileName('gif') })
      else downloadBlob(result.blob, fileName('webm'))
    } catch (e) {
      if (!running.signal.aborted) {
        if (!e?.expected) console.error('Capture failed', e)
        showMessage(e?.message ?? String(e))
      }
    } finally {
      running = null
      button.textContent = buttonLabel
      progress.hidden = true
    }
  }

  async function screenshot() {
    read({ revert: true })
    showMessage('')
    try {
      const blob = await takeScreenshot({ session, settings: { ...cap } })
      if (blob) downloadBlob(blob, fileName('png'))
      else showMessage(`Screenshot is not available in ${session.concreteMode} mode.`)
    } catch (e) {
      console.error('Screenshot failed', e)
      showMessage(e?.message ?? String(e))
    }
  }

  transport.setCaptureHandler(capture)
  transport.setScreenshotHandler(screenshot)
}
