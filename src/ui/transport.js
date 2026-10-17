// Transport row: restart, pause, step, time readout, slider, fullscreen, screenshot,
// plus the Capture button's availability. Task 11 installs the screenshot and capture handlers.
// Also the global Alt shortcuts, which the editor keymap handles while it has focus.

export function createTransport({ session }) {
  const $ = id => document.getElementById(id)
  const row = $('transport')
  const pause = $('btn-pause'), step = $('btn-step'), display = $('time-display'), slider = $('time-slider')
  const screenshot = $('btn-screenshot'), capture = $('btn-capture')
  const captureTitle = capture.title
  let sliding = false
  let screenshotHandler = null, captureHandler = null

  $('btn-restart').addEventListener('click', () => session.restart())
  pause.addEventListener('click', () => session.togglePause())
  step.addEventListener('click', () => session.step())
  slider.addEventListener('pointerdown', () => { sliding = true })
  window.addEventListener('pointerup', () => { sliding = false })
  slider.addEventListener('input', () => session.seek(Number(slider.value)))
  $('btn-fullscreen').addEventListener('click', () => session.getRunner()?.element.requestFullscreen())
  screenshot.addEventListener('click', () => screenshotHandler?.())
  capture.addEventListener('click', () => captureHandler?.())

  const timeless = 'Not available: this mode runs its own loop'
  const titles = new Map([pause, step, slider].map(el => [el, el.title]))

  session.on('state', ({ time, step: i, playing, supportsTime, supportsCapture, safeStart }) => {
    const text = time.toFixed(2)
    if (display.textContent !== text) display.textContent = text
    if (!sliding && i >= 0) slider.value = String(i)
    pause.textContent = playing ? '▌▌' : '►'
    row.classList.toggle('disabled', !supportsTime)
    for (const [el, title] of titles) {
      el.disabled = !supportsTime
      el.title = supportsTime ? title : `${title} (${timeless})`
    }
    capture.disabled = !supportsCapture
    capture.title = supportsCapture ? captureTitle
      : safeStart ? `${captureTitle} (run the program first)`
        : `Capture is not available in ${session.concreteMode} mode`
  })

  return {
    setScreenshotHandler(fn) { screenshotHandler = fn },
    setCaptureHandler(fn) { captureHandler = fn },
  }
}

// Alt+Up pause, Alt+Down / Alt+Enter restart, Alt+Right step, Ctrl+S save.
// Keys the editor already handled arrive with defaultPrevented set.
export function installGlobalKeys({ pause, restart, step, save }) {
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
      const handled = e.defaultPrevented // the editor keymap already saved
      e.preventDefault() // never the browser's Save Page dialog
      if (!handled) save()
      return
    }
    if (e.defaultPrevented || !e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return
    const action = { ArrowUp: pause, ArrowDown: restart, Enter: restart, ArrowRight: step }[e.key]
    if (!action) return
    e.preventDefault()
    action()
  })
}
