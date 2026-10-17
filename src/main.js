// App entry: opens the library, builds the editor, session and panels, then opens the first creation.

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
import { buildShareUrl, parseShareUrl } from './code/share.js'
import { inkFraction } from './runner/sample.js'
import { openLibrary } from './library/library.js'
import { createLibraryController } from './app/libraryController.js'
import { createCapturePanel } from './ui/capturePanel.js'
import { createGifPreview } from './ui/gifPreview.js'

const $ = id => document.getElementById(id)
const settings = loadSettings()

let session = null
let library = null // the library controller
const keys = {
  pause: () => session?.togglePause(),
  restart: () => session?.restart(),
  step: () => session?.step(),
  save: () => library?.actions.save(),
}
const editor = createEditor($('editor'), {
  theme: settings.theme,
  fontSize: settings.fontSize,
  onChange: (code, info) => session?.codeEdited(code, info),
  keys,
})

// Without IndexedDB the app still works, in memory (the controller shows why).
const libraryReady = openLibrary().catch(e => { console.error('Could not open the library', e); return null })

async function boot() {
  const lib = await libraryReady
  let canvasPanel = null
  session = createSession({
    container: $('canvas-host'), editor, clock: createClock(), settings, library: lib,
    ui: { showSafeStart: on => canvasPanel?.showSafeStart(on) },
  })
  library = createLibraryController({ session, settings, saveSettings, lib })

  function share() {
    const url = buildShareUrl(location.href, { name: session.creation.name, mode: session.mode, code: session.code })
    prompt('CapJS Code URL\nThis url contains your entire program!\nYou can share or bookmark this link.', url)
  }

  createTopbar({ session, editor, settings, saveSettings, actions: { ...library.actions, share } })
  const transport = createTransport({ session })
  createCapturePanel({ session, settings, saveSettings, transport, preview: createGifPreview() })
  canvasPanel = createCanvasPanel({ session, settings, saveSettings, kv: lib })
  createStatusBar({ session, editor })
  createErrorBar({ session, errorEl: $('error-bar'), consoleEl: $('console-bar') })
  installGlobalKeys(keys)

  // A share link opens as a new creation; otherwise the last one.
  const shared = parseShareUrl(location.href)
  if (shared) history.replaceState(null, '', location.pathname + location.hash)
  await library.boot(shared)
  canvasPanel.restoreImage()

  window.capjsDebug = {
    // Ink fraction of the current frame, by the same rule as the runner harness.
    async sampleFrame(w = 32, h = 18) {
      const bitmap = await session.getRunner()?.grab()
      try { return await inkFraction(bitmap, w, h) } finally { bitmap?.close() }
    },
    session,
  }
}
boot().catch(e => console.error('Boot failed', e))
