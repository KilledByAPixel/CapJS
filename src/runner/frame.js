// Page-mode entry, loaded by frame.html inside a same-origin sandboxed iframe.
// Speaks the protocol in protocol.js with `parent`.

import { createRuntime } from './runtime.js'
import { CANVAS_MODES, errorInfo, makeReply, transferList } from './protocol.js'
import { wrapLoops, wrapHtmlScripts } from '../code/loopProtect.js'
import { parseErrorLine } from '../code/errors.js'
import { blockUnhandledFileDrops } from '../ui/dropGuard.js'
import littlejsUrl from 'littlejsengine/dist/littlejs.js?url'

const JS_BUDGET_MS = 2000
const LITTLEJS_BUDGET_MS = 200
const HTML_BUDGET_MS = 200
const LOOP_CHECK_MASK = 1023 // check the clock every 1024 guard calls
const GRAB_TIMEOUT_MS = 1000

let mode = null
let runtime = null, canvas = null
let pageBaseline = null // window's own properties once frame.js is set up; later ones are cleared on load
let image = null
let collecting = null // errors raised synchronously during a load, reported in its reply
let pendingGrabs = [] // littlejs grab callbacks, serviced at the end of the next render
const noop = () => {}
const indirectEval = (0, eval)

const post = (msg, transfer = []) => parent.postMessage(msg, '*', transfer)

// --- Loop guard for js, littlejs and html (canvas modes use the runtime's own) ---

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
  if (mode === 'html') return htmlLine(userLineno(event))
  if (mode === 'js') return parseErrorLine(event.error?.stack, 0)
  return parseErrorLine(event.error?.stack)
}

// Chrome numbers the lines of inline scripts added by document.write() from the
// script's own start. While a script runs it is document.currentScript, so add
// the line its text starts on in the user's code.
let htmlCode = ''

// The loop guard throws from this file, so the event's line is ours: take the
// first stack frame outside it (the user's script) instead.
function userLineno(event) {
  if (event.filename !== import.meta.url || !event.error?.stack) return event.lineno
  for (const frame of event.error.stack.split('\n').slice(1)) {
    if (frame.includes(import.meta.url)) continue
    const m = /:(\d+):\d+\)?\s*$/.exec(frame)
    return m ? Number(m[1]) : null
  }
  return null
}

function htmlLine(lineno) {
  if (lineno == null) return null
  const script = document.currentScript
  const at = script && !script.src ? htmlCode.indexOf(script.text) : -1
  return at < 0 ? lineno : htmlCode.slice(0, at).split('\n').length - 1 + lineno
}

function reportError(error) {
  if (collecting) collecting.push(error)
  else post({ type: 'error', error })
}

function onWindowError(event) {
  reportError(errorInfo(event.error?.message ?? event.message, errorLine(event)))
}

// --- Modes ---

// Every load starts from scratch: no canvas, no runtime, no user globals, no pending grabs.
function resetPage() {
  canvas?.remove()
  canvas = runtime = null
  answerGrabs(null)
  for (const k of Object.getOwnPropertyNames(window)) {
    if (!pageBaseline.has(k)) try { delete window[k] } catch { /* non-configurable */ }
  }
}

async function loadCanvas(msg) {
  canvas = document.createElement('canvas')
  canvas.id = 'c'
  canvas.style.cssText = 'display:block;width:100%;height:100%'
  document.body.append(canvas)
  runtime = createRuntime({ canvas, globalScope: window })
  if (image) await runtime.handle({ type: 'image', id: -1, bitmap: image })
  return runtime.handle(msg)
}

// Inline scripts are loop-protected; wrapLoops keeps every newline, so error lines still match.
function loadHtml(msg) {
  htmlCode = msg.loopProtect ? wrapHtmlScripts(msg.code) : msg.code
  document.open()
  installListeners() // document.open erased them; reinstall before the user's scripts run
  window.__lg = pageGuard
  guardCalls = 0
  keepDeadline(HTML_BUDGET_MS)
  document.write(htmlCode)
  document.close()
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
// canvas must be copied before the frame ends. The canvases are stacked in DOM
// order (all absolutely positioned, no z-index), so composite them in that order,
// copying the WebGL canvas through glCopyToContext wherever it sits.
function serviceGrabs() {
  if (!pendingGrabs.length) return
  const [main, glCanvas] = indirectEval('[mainCanvas, glCanvas]')
  const tmp = new OffscreenCanvas(main.width, main.height)
  const tmpCtx = tmp.getContext('2d')
  for (const cv of document.querySelectorAll('canvas')) {
    if (cv === glCanvas) window.glCopyToContext(tmpCtx)
    else if (cv === main || cv.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_PRECEDING) {
      tmpCtx.drawImage(cv, 0, 0, tmp.width, tmp.height)
    }
  }
  const grabs = pendingGrabs
  pendingGrabs = []
  createImageBitmap(tmp).then(bitmap => grabs.forEach((done, i) => done(i ? null : bitmap)))
}

function answerGrabs(bitmap) {
  const grabs = pendingGrabs
  pendingGrabs = []
  grabs.forEach(done => done(bitmap))
}

// Replies at the end of the next render, or with null after GRAB_TIMEOUT_MS.
function grabLittlejs(msg) {
  if (!window.engineInit || !indirectEval('engineInitialized')) return makeReply(msg.id, { bitmap: null })
  return new Promise(resolve => {
    const done = bitmap => {
      clearTimeout(timer)
      pendingGrabs = pendingGrabs.filter(g => g !== done)
      resolve(makeReply(msg.id, { bitmap }))
    }
    const timer = setTimeout(() => done(null), GRAB_TIMEOUT_MS)
    pendingGrabs.push(done)
  })
}

// --- Requests ---

async function handle(msg) {
  if (msg.type === 'load') {
    resetPage()
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
  // html, js and littlejs run on their own; frames only matter for a grab.
  const wantsBitmap = msg.type === 'grab' || (msg.type === 'frames' && msg.grab)
  if (wantsBitmap) return mode === 'littlejs' ? grabLittlejs(msg) : makeReply(msg.id, { bitmap: null })
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
  blockUnhandledFileDrops(window) // a drop inside the frame must never navigate it to the file
}

document.documentElement.style.height = '100%'
document.body.style.cssText = 'margin:0;height:100%;overflow:hidden'
installListeners()
pageBaseline = new Set(Object.getOwnPropertyNames(window))
post({ type: 'ready' })
