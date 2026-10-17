// App entry: builds the editor, session and panels, then opens the first creation.

import './ui/layout.css'
import { loadSettings, saveSettings } from './app/settings.js'
import { createClock } from './app/clock.js'
import { createSession } from './app/session.js'
import { createEditor } from './ui/editor.js'
import { createTopbar } from './ui/topbar.js'
import { createTransport, installGlobalKeys } from './ui/transport.js'
import { createCanvasPanel } from './ui/canvasPanel.js'
import { createStatusBar } from './ui/statusBar.js'
import { createErrorBar } from './ui/errorBar.js'
import { downloadBlob } from './ui/download.js'
import { buildShareUrl, parseShareUrl } from './code/share.js'
import { detectMode } from './code/detect.js'
import { inkFraction } from './runner/sample.js'
import { MODES } from './runner/protocol.js'
import { TEMPLATES } from './library/templates.js'
import { DEFAULT_CREATION_SETTINGS, openLibrary } from './library/library.js'

const $ = id => document.getElementById(id)
const settings = loadSettings()

let session = null
const keys = {
  pause: () => session.togglePause(),
  restart: () => session.restart(),
  step: () => session.step(),
  save: () => save(),
}
const editor = createEditor($('editor'), {
  theme: settings.theme,
  fontSize: settings.fontSize,
  onChange: (code, info) => session?.codeEdited(code, info),
  keys,
})

let canvasPanel = null
// The library UI arrives in Task 10; until then creations live in memory only.
session = createSession({
  container: $('canvas-host'), editor, clock: createClock(), settings, library: null,
  ui: { showSafeStart: on => canvasPanel?.showSafeStart(on) },
})

// Without a library, Save downloads the code as a text file.
function save() {
  downloadBlob(new Blob([session.code], { type: 'text/plain' }), `${session.creation.name}.txt`)
}

function share() {
  const url = buildShareUrl(location.href, { name: session.creation.name, mode: session.mode, code: session.code })
  prompt('CapJS Code URL\nThis url contains your entire program!\nYou can share or bookmark this link.', url)
}

createTopbar({ session, editor, settings, saveSettings, actions: { save, share } })
const transport = createTransport({ session }) // Task 11: transport.setScreenshotHandler / setCaptureHandler
// Only the library's key-value store is used for now: it keeps the custom image.
const kv = openLibrary().catch(e => { console.error('Could not open the library', e); return null })
canvasPanel = createCanvasPanel({
  session, settings, saveSettings,
  kv: { getKV: async k => (await kv)?.getKV(k) ?? null, setKV: async (k, v) => (await kv)?.setKV(k, v) },
})
createStatusBar({ session, editor })
createErrorBar({ session, errorEl: $('error-bar'), consoleEl: $('console-bar') })
installGlobalKeys(keys)

// --- Boot: a share link, or the dweet template ---

const shared = parseShareUrl(location.href)
if (shared) history.replaceState(null, '', location.pathname + location.hash)
const start = shared
  ? { name: shared.name || 'shared', mode: MODES.includes(shared.mode) ? shared.mode : 'auto', code: shared.code }
  : TEMPLATES.find(t => t.id === 'dweet')
// Keep auto detection on when it already picks the right mode, so pasting other code just works.
const mode = detectMode(start.code) === start.mode ? 'auto' : start.mode
session.open({
  creation: { id: null, name: start.name },
  version: { code: start.code, mode, runMode: 'auto', settings: DEFAULT_CREATION_SETTINGS },
  safeStart: true,
})
canvasPanel.restoreImage()

window.capjsDebug = {
  // Ink fraction of the current frame, by the same rule as the runner harness.
  async sampleFrame(w = 32, h = 18) {
    const bitmap = await session.getRunner()?.grab()
    try { return await inkFraction(bitmap, w, h) } finally { bitmap?.close() }
  },
  session,
}
