// Page-mode entry, loaded by frame.html inside a same-origin sandboxed iframe.
// Speaks the protocol in protocol.js with `parent`.

import { createRuntime } from './runtime.js'
import { CANVAS_MODES, errorInfo, makeReply, transferList } from './protocol.js'
import { wrapLoops } from '../code/loopProtect.js'
import { parseErrorLine } from '../code/errors.js'
import littlejsUrl from 'littlejsengine/dist/littlejs.js?url'

const JS_BUDGET_MS = 2000
const LITTLEJS_BUDGET_MS = 200
const LOOP_CHECK_MASK = 1023 // check the clock every 1024 guard calls

let mode = null
let runtime = null, runtimeMode = null, canvas = null
let image = null
let collecting = null // errors raised synchronously during a load, reported in its reply
let pendingGrabs = [] // littlejs grab callbacks, serviced at the end of the next render
const noop = () => {}
const indirectEval = (0, eval)

const post = (msg, transfer = []) => parent.postMessage(msg, '*', transfer)

// --- Loop guard for js and littlejs (canvas modes use the runtime's own) ---

let deadline = Infinity, guardCalls = 0, deadlineBudget = 0, ticking = false

function pageGuard() {
  if ((++guardCalls & LOOP_CHECK_MASK) === 0 && performance.now() > deadline) throw Error('Loop timed out')
}

// Refreshes the deadline every animation frame, so only a loop that blocks the
// page for longer than the budget is stopped.
function keepDeadline(budgetMs) {
  deadlineBudget = budgetMs
  deadline = performance.now() + budgetMs
  if (ticking) return
  ticking = true
  const tick = () => {
    deadline = performance.now() + deadlineBudget
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// --- Errors outside requests ---

function errorLine(event) {
  // Inline user scripts report lineno directly; errors raised inside the engine script itself have no editor line.
  if (mode === 'littlejs') return event.filename && event.filename !== location.href ? null : event.lineno
  if (mode === 'js') return parseErrorLine(event.error?.stack, 0)
  return parseErrorLine(event.error?.stack)
}

function reportError(error) {
  if (collecting) collecting.push(error)
  else post({ type: 'error', error })
}

function onWindowError(event) {
  reportError(errorInfo(event.error?.message ?? event.message, errorLine(event)))
}

// --- Modes ---

async function loadCanvas(msg) {
  if (!runtime || runtimeMode !== msg.mode) {
    canvas?.remove()
    canvas = document.createElement('canvas')
    canvas.id = 'c'
    canvas.style.cssText = 'display:block;width:100%;height:100%'
    document.body.append(canvas)
    runtime = createRuntime({ canvas, globalScope: window })
    runtimeMode = msg.mode
    if (image) await runtime.handle({ type: 'image', id: -1, bitmap: image })
  }
  return runtime.handle(msg)
}

function loadHtml(msg) {
  document.open()
  document.write(msg.code)
  document.close()
  installListeners() // document.open erased them
  return makeReply(msg.id)
}

function loadJs(msg) {
  const lines = []
  const log = console.log
  console.log = (...args) => { lines.push(args.join(' ')) }
  window.image = image
  window.__lg = pageGuard
  guardCalls = 0
  deadline = performance.now() + JS_BUDGET_MS
  let error = null
  try {
    indirectEval(msg.loopProtect ? wrapLoops(msg.code) : msg.code)
  } catch (e) {
    error = errorInfo(e?.message ?? e, parseErrorLine(e?.stack, 0))
  } finally {
    console.log = log
  }
  keepDeadline(JS_BUDGET_MS) // later loops (rAF callbacks) get the same budget per frame
  return makeReply(msg.id, { error, console: lines.join('\n') })
}

function injectScript({ src, text }) {
  const script = document.createElement('script')
  if (text !== undefined) {
    script.textContent = text
    document.body.append(script) // inline classic scripts run synchronously
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    script.onload = resolve
    script.onerror = () => reject(Error(`Failed to load ${src}`))
    script.src = src
    document.head.append(script)
  })
}

async function loadLittlejs(msg) {
  window.image = image
  window.__lg = pageGuard
  guardCalls = 0
  keepDeadline(LITTLEJS_BUDGET_MS)
  if (!window.engineInit) await injectScript({ src: littlejsUrl })
  const errors = []
  collecting = errors
  try {
    await injectScript({ text: msg.loopProtect ? wrapLoops(msg.code) : msg.code })
    if (!errors.length) startEngine()
  } catch (e) {
    errors.push(errorInfo(e?.message ?? e, parseErrorLine(e?.stack, 0)))
  } finally {
    collecting = null
  }
  return makeReply(msg.id, { error: errors[0] ?? null })
}

// User callbacks may be function declarations or top-level let/const, so look them up by name.
const userFunction = name => indirectEval(`typeof ${name} == 'function' ? ${name} : undefined`)

function startEngine() {
  if (indirectEval('engineInitialized')) {
    // The user called engineInit; service grabs from a plugin, which renders after gameRenderPost.
    window.engineAddPlugin(undefined, serviceGrabs)
    return
  }
  const renderPost = userFunction('gameRenderPost') ?? noop
  window.engineInit(
    userFunction('gameInit') ?? noop,
    userFunction('gameUpdate') ?? noop,
    userFunction('gameUpdatePost') ?? noop,
    userFunction('gameRender') ?? noop,
    () => { renderPost(); serviceGrabs() },
  ).catch(e => reportError(errorInfo(e?.message ?? e, parseErrorLine(e?.stack, 0))))
}

// Runs inside a LittleJS render: it has no preserveDrawingBuffer, so the WebGL
// canvas must be copied before the frame ends.
function serviceGrabs() {
  if (!pendingGrabs.length) return
  const grabs = pendingGrabs
  pendingGrabs = []
  const [main, glCanvas] = indirectEval('[mainCanvas, glCanvas]')
  const tmp = new OffscreenCanvas(main.width, main.height)
  const tmpCtx = tmp.getContext('2d')
  window.glCopyToContext(tmpCtx)
  const canvases = [...document.querySelectorAll('canvas')]
  for (const cv of canvases.slice(canvases.indexOf(main))) {
    if (cv !== glCanvas) tmpCtx.drawImage(cv, 0, 0, tmp.width, tmp.height)
  }
  createImageBitmap(tmp).then(bitmap => {
    grabs.forEach((done, i) => done(i ? null : bitmap))
  })
}

function grabLittlejs(msg) {
  if (!window.engineInit || !indirectEval('engineInitialized')) return makeReply(msg.id, { bitmap: null })
  return new Promise(resolve => pendingGrabs.push(bitmap => resolve(makeReply(msg.id, { bitmap }))))
}

// --- Requests ---

async function handle(msg) {
  if (msg.type === 'load') {
    mode = msg.mode
    if (CANVAS_MODES.includes(mode)) return loadCanvas(msg)
    if (mode === 'html') return loadHtml(msg)
    if (mode === 'js') return loadJs(msg)
    if (mode === 'littlejs') return loadLittlejs(msg)
    return makeReply(msg.id, { error: errorInfo(`Unknown mode: ${mode}`) })
  }
  if (msg.type === 'image') {
    image = msg.bitmap ?? null
    window.image = image
  }
  if (runtime && CANVAS_MODES.includes(mode)) return runtime.handle(msg)
  if (msg.type === 'grab') return mode === 'littlejs' ? grabLittlejs(msg) : makeReply(msg.id, { bitmap: null })
  return makeReply(msg.id)
}

// Requests are handled one at a time, in arrival order.
let queue = Promise.resolve()

function onMessage(event) {
  if (event.source !== parent) return
  const msg = event.data
  queue = queue.then(async () => {
    let reply
    try {
      reply = await handle(msg)
    } catch (e) {
      reply = makeReply(msg.id, { error: errorInfo(e?.message ?? e) })
    }
    post(reply, transferList(reply))
  }).catch(e => console.error(e))
}

function installListeners() {
  window.addEventListener('message', onMessage)
  window.addEventListener('error', onWindowError)
}

document.documentElement.style.height = '100%'
document.body.style.cssText = 'margin:0;height:100%;overflow:hidden'
installListeners()
post({ type: 'ready' })
