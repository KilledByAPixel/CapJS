// Capture panel: format, size, seconds, fps, dither, speed and the Capture button
// (which cancels while a capture runs), plus the screenshot button. Settings live in
// settings.capture and persist. A GIF opens in the preview; WebM and PNG download.

import { runCapture, takeScreenshot } from '../capture/capture.js'
import { downloadBlob } from './download.js'

const NUMBERS = { // id suffix -> [settings key, min, max, integer]
  width: ['width', 1, 8192, true],
  height: ['height', 1, 8192, true],
  seconds: ['seconds', 0.1, 600, false],
  fps: ['fps', 1, 120, false],
  speed: ['speed', 0.1, 10, false],
}

export function createCapturePanel({ session, settings, saveSettings, transport, preview }) {
  const $ = id => document.getElementById(id)
  const cap = settings.capture
  const format = $('cap-format'), dither = $('cap-dither')
  const button = $('btn-capture'), progress = $('capture-progress'), message = $('capture-message')
  const buttonLabel = button.textContent
  const numbers = Object.entries(NUMBERS).map(([id, spec]) => [$('cap-' + id), ...spec])

  format.value = cap.format
  dither.value = cap.dither
  for (const [input, key] of numbers) input.value = cap[key]

  function showHints() {
    for (const el of document.querySelectorAll('.cap-dither-row')) el.hidden = cap.format !== 'gif'
  }
  showHints()
  session.setSpeed(cap.speed) // speed drives live playback as well as captures

  // Reads the inputs into settings.capture. With `revert`, invalid numbers show the setting again.
  function read({ revert = false } = {}) {
    cap.format = format.value
    cap.dither = dither.value
    for (const [input, key, min, max, integer] of numbers) {
      const n = integer ? Math.round(Number(input.value)) : Number(input.value)
      if (input.value !== '' && n >= min && n <= max) cap[key] = n
      else if (revert) input.value = cap[key]
    }
    saveSettings(settings)
    session.setSpeed(cap.speed)
    showHints()
  }
  for (const el of [format, dither]) el.addEventListener('change', () => read())
  for (const [input] of numbers) {
    input.addEventListener('input', () => read())
    input.addEventListener('change', () => read({ revert: true }))
  }

  const fileName = (ext, name = session.creation.name) => `${name || 'capjs'}.${ext}`
  const showMessage = text => { message.textContent = text ?? '' }

  let running = null // the AbortController of the capture in progress

  async function capture() {
    if (running) return running.abort() // the button cancels a running capture
    read({ revert: true })
    showMessage('')
    const run = running = new AbortController()
    const name = session.creation.name // the creation captured, even if another is opened meanwhile
    button.textContent = '■ Cancel capture'
    progress.value = 0
    progress.hidden = false
    try {
      const result = await runCapture({
        session, settings: { ...cap }, creationSettings: session.creationSettings, signal: run.signal,
        onProgress({ phase, fraction }) {
          progress.value = phase === 'capture' ? fraction * 0.6 : 0.6 + fraction * 0.4
          progress.title = `${phase === 'capture' ? 'Capturing frames' : 'Encoding'}: ${Math.round(fraction * 100)}%`
        },
      })
      if (run.signal.aborted) return // cancelled as it finished
      if (result.format === 'gif') preview.open({ blob: result.blob, overLimit: result.overLimit, filename: fileName('gif', name) })
      else downloadBlob(result.blob, fileName('webm', name))
    } catch (e) {
      if (!run.signal.aborted) {
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
