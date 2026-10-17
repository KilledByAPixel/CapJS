// Main-page side of a running program. Worker mode runs the shared runtime in a
// Web Worker on an OffscreenCanvas, guarded by a watchdog that kills a hung
// worker; page mode runs frame.html in a sandboxed iframe. Both speak the
// protocol in protocol.js.

import { CANVAS_MODES, errorInfo } from './protocol.js'
import { resolveRunMode } from '../code/detect.js'

export const WORKER_BUDGET_MS = 500
export const PAGE_BUDGET_MS = 200
export const CAPTURE_BUDGET_MS = 10000

const LOAD_BUDGET_MS = 5000 // three.js import plus setup can take a while
// The watchdog fires this long after a request's budget, so a loop-protected
// program can stop itself and reply before the worker is killed.
const WATCHDOG_GRACE_MS = 250
const FRAME_URL = import.meta.env.BASE_URL + 'frame.html'

let nextId = 1 // unique across runners, so a reply can never match another request

const timeoutError = budgetMs => ({
  message: `Stopped: a frame took longer than ${budgetMs} ms (infinite loop?)`,
  line: null,
  timedOut: true,
})

export function createRunner({ container, mode, runMode, width, height, background = null }) {
  runMode = resolveRunMode(mode, runMode, '')
  const inWorker = runMode === 'worker'

  const element = document.createElement('div')
  element.style.cssText = `position:relative;width:100%;height:100%;overflow:hidden;background:${background ?? 'none'}`
  container.append(element)

  let worker = null, canvas = null, iframe = null
  let dead = false, deadError = null, destroyed = false
  let image = null
  let frameReady = null // resolves when the current iframe posts ready
  const pending = new Map() // id -> settle(reply)
  const asyncErrorFns = []

  // --- Display ---

  function newCanvas() {
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.style.cssText = 'display:block;width:100%;height:100%'
    element.replaceChildren(canvas)
  }

  // --- Transport ---

  function onReply(msg) {
    const settle = pending.get(msg.id)
    if (!settle) return // stale: from a replaced worker or iframe, or already timed out
    pending.delete(msg.id)
    settle(msg)
  }

  function reportAsync(error) {
    for (const fn of asyncErrorFns) fn(error)
  }

  function onWindowMessage(event) {
    if (!iframe || event.source !== iframe.contentWindow) return
    const msg = event.data
    if (msg?.type === 'reply') onReply(msg)
    else if (msg?.type === 'ready') frameReady?.resolve()
    else if (msg?.type === 'error') reportAsync(msg.error)
  }
  if (!inWorker) window.addEventListener('message', onWindowMessage)

  // Sends one request and resolves with its reply. In worker mode a watchdog
  // kills the worker if the reply doesn't arrive in time.
  function send(msg, budgetMs, transfer = []) {
    const id = nextId++
    return new Promise(resolve => {
      let timer = null
      pending.set(id, reply => { clearTimeout(timer); resolve(reply) })
      if (inWorker) {
        timer = setTimeout(() => {
          pending.delete(id)
          kill(budgetMs)
          resolve({ error: deadError, console: '' })
        }, budgetMs + WATCHDOG_GRACE_MS)
        worker.postMessage({ ...msg, id }, transfer)
      } else {
        iframe.contentWindow.postMessage({ ...msg, id }, '*', transfer)
      }
    })
  }

  function kill(budgetMs) {
    stopWorker()
    newCanvas() // the old canvas belongs to the dead worker
    dead = true
    deadError = timeoutError(budgetMs)
  }

  function stopWorker() {
    worker?.terminate()
    worker = null
    pending.clear() // their replies can never come; the caller settles its own
  }

  // Requests run one at a time, so each watchdog times only its own request.
  let queue = Promise.resolve()
  function enqueue(fn) {
    const result = queue.then(fn)
    queue = result.catch(() => {})
    return result
  }

  const failure = () =>
    destroyed ? errorInfo('Runner destroyed')
      : dead ? deadError
        : !(worker || iframe) ? errorInfo('No program loaded')
          : null

  function request(msg, budgetMs, transfer) {
    return enqueue(() => failure() ? { error: failure(), console: '' } : send(msg, budgetMs, transfer))
  }

  // --- Loading: always a fresh worker and canvas, or a fresh frame.html ---

  async function startWorker() {
    stopWorker()
    newCanvas()
    const offscreen = canvas.transferControlToOffscreen()
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = e => onReply(e.data)
    worker.onerror = e => { e.preventDefault(); reportAsync(errorInfo(e.message || 'Worker error')) }
    dead = false
    deadError = null
    return send({ type: 'init', canvas: offscreen }, LOAD_BUDGET_MS, [offscreen])
  }

  async function startFrame() {
    pending.clear()
    let resolve
    frameReady = new Promise(r => { resolve = r })
    frameReady.resolve = resolve
    const ready = frameReady
    iframe = document.createElement('iframe')
    iframe.sandbox = 'allow-scripts allow-same-origin'
    iframe.style.cssText = 'display:block;width:100%;height:100%;border:0'
    iframe.src = FRAME_URL
    element.replaceChildren(iframe)
    await ready
    if (CANVAS_MODES.includes(mode)) listenForMouse(iframe.contentWindow)
    return { error: null }
  }

  function load(code, { loopProtect = false } = {}) {
    return enqueue(async () => {
      if (destroyed) return { error: errorInfo('Runner destroyed'), console: '' }
      const started = await (inWorker ? startWorker() : startFrame())
      if (started.error) return started
      if (image) {
        const r = await send({ type: 'image', bitmap: image }, WORKER_BUDGET_MS)
        if (r.error) return r
      }
      return send({ type: 'load', mode, code, width, height, background, loopProtect }, LOAD_BUDGET_MS)
    }).then(({ error, console }) => ({ error, console }))
  }

  // --- Mouse: Shadertoy iMouse in canvas pixels, y up ---

  let mouse = [0, 0, 0, 0]
  const mouseHandlers = {
    mousedown(e, p) { mouse = [p[0], p[1], p[0], p[1]] },
    mousemove(e, p) { if (e.buttons) mouse = [p[0], p[1], mouse[2], mouse[3]]; else return false },
    mouseup() { mouse = [mouse[0], mouse[1], 0, 0] },
  }

  // `target` is the display element (worker mode) or the frame's window (page mode).
  function listenForMouse(target) {
    for (const [type, update] of Object.entries(mouseHandlers)) {
      target.addEventListener(type, e => {
        const isWindow = target === target.window
        const rect = isWindow ? { left: 0, top: 0, width: target.innerWidth, height: target.innerHeight } : target.getBoundingClientRect()
        const p = [(e.clientX - rect.left) * width / rect.width, (rect.top + rect.height - e.clientY) * height / rect.height]
        if (update(e, p) !== false) setMouse(...mouse)
      })
    }
  }
  if (inWorker) listenForMouse(element)

  function setMouse(x, y, z, w) {
    return request({ type: 'mouse', x, y, z, w }, WORKER_BUDGET_MS)
  }

  return {
    mode,
    runMode,
    element,
    supportsTime: CANVAS_MODES.includes(mode),
    supportsCapture: CANVAS_MODES.includes(mode),
    get dead() { return dead },

    load,

    setCode(code) {
      return request({ type: 'setCode', code }, WORKER_BUDGET_MS).then(({ error, console }) => ({ error, console }))
    },

    runFrames(frames, { budgetMs = WORKER_BUDGET_MS, grab = false } = {}) {
      return request({ type: 'frames', frames, budgetMs, grab }, budgetMs)
        .then(({ error, console, bitmap }) => ({ error, console, bitmap: bitmap ?? null }))
    },

    grab() {
      return request({ type: 'grab' }, WORKER_BUDGET_MS).then(r => r.bitmap ?? null)
    },

    // The image is cloned, not transferred, so it can be sent again after each load.
    setImage(bitmap) {
      image = bitmap ?? null
      return request({ type: 'image', bitmap: image }, WORKER_BUDGET_MS)
    },

    setMouse,

    onAsyncError(fn) {
      asyncErrorFns.push(fn)
    },

    destroy() {
      if (destroyed) return
      destroyed = true
      for (const settle of pending.values()) settle({ error: errorInfo('Runner destroyed'), console: '' })
      stopWorker()
      if (!inWorker) window.removeEventListener('message', onWindowMessage)
      iframe = null
      element.remove()
    },
  }
}
