// The editing session: the open creation's working copy, its runner, and the live loop.
//
// The working copy is the code plus mode, runMode and creation settings. Edits are
// debounced, then applied by the on-change setting (restart / rebuild / nothing).
// The live loop drives the fixed-step clock from requestAnimationFrame and sends
// steps to the runner one request at a time (backpressure: no tick while busy).
//
// Events (session.on): 'state' {time, step, playing, error, console, supportsTime,
// supportsCapture, safeStart}, 'codeChanged' {code, modified}, and 'renamed' {id, name}
// once a library rename has been stored.
//
// `ui.showSafeStart(bool)` shows or hides the "Click to run" overlay.
// `library` is optional; when present, drafts are written with library.setDraft.

import { createRunner, WORKER_BUDGET_MS, PAGE_BUDGET_MS } from '../runner/runner.js'
import { effectiveMode, resolveRunMode } from '../code/detect.js'
import { DEFAULT_CREATION_SETTINGS } from '../library/library.js'

export const CHANGE_DEBOUNCE_MS = 300
export const DRAFT_DEBOUNCE_MS = 500
const MAX_CONSOLE_CHARS = 4000

const clone = v => structuredClone(v)

export function createSession({ container, editor, clock, settings, library = null, ui = {} }) {
  const listeners = new Map()
  const emit = (name, data) => listeners.get(name)?.forEach(fn => fn(data))

  let creation = { id: null, name: 'untitled' }
  let saved = null // the last saved version's {code, mode, runMode, settings}
  let code = ''
  let work = { mode: 'auto', runMode: 'auto', settings: clone(DEFAULT_CREATION_SETTINGS) }

  let runner = null, runnerKey = ''
  let generation = 0 // bumped by every load; results from older generations are dropped
  let busy = null // token of the request in flight
  let lastStep = -1
  let error = null, consoleText = ''
  let pausedByError = false
  let safeStart = false
  let suspended = false // a capture is running: nothing drives the live runner
  let restartPending = false // a restart asked for while suspended, run on resume
  let image = null
  let changeTimer = null, draftTimer = null

  const concreteMode = () => effectiveMode(work.mode, code)
  const resolvedRunMode = () => resolveRunMode(concreteMode(), work.runMode, code)
  const background = () => work.settings.background?.enabled ? work.settings.background.color : null

  // --- State ---

  // The first error stays until the code changes or the program restarts (setError(null)):
  // later errors are usually its consequences. Any error still pauses the program.
  function setError(e) {
    if (e && error) {
      clock.playing = false
      return
    }
    error = e ?? null
    editor.markError(error?.line ?? null)
    pausedByError = !!error
    if (error) clock.playing = false
  }

  function addConsole(text) {
    if (text) consoleText = (consoleText ? consoleText + '\n' + text : text).slice(-MAX_CONSOLE_CHARS)
  }

  function setSafeStart(on) {
    safeStart = on
    ui.showSafeStart?.(on)
  }

  const state = () => ({
    time: Math.max(lastStep, 0) / 60,
    step: lastStep,
    playing: clock.playing,
    error,
    console: consoleText,
    supportsTime: !!runner?.supportsTime,
    supportsCapture: !!runner?.supportsCapture,
    safeStart,
  })
  const emitState = () => emit('state', state())

  const sameSettings = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const isModified = () => !saved || saved.code !== code || saved.mode !== work.mode
    || saved.runMode !== work.runMode || !sameSettings(saved.settings, work.settings)

  const workingCopy = () => ({ code, mode: work.mode, runMode: work.runMode, settings: clone(work.settings) })

  // Every change to the working copy: tell the UI, and write the draft (debounced).
  let writeDraft = null // the pending draft write, run by its timer or by flushDraft
  let draftWrite = null // the draft write in flight
  function changed() {
    emit('codeChanged', { code, modified: isModified() })
    if (!library || !creation.id) return
    clearTimeout(draftTimer)
    const id = creation.id
    writeDraft = () => {
      writeDraft = null
      const write = draftWrite = library.setDraft(id, workingCopy())
        .catch(e => console.error('Could not save draft', e))
        .finally(() => { if (draftWrite === write) draftWrite = null })
      return write
    }
    draftTimer = setTimeout(writeDraft, DRAFT_DEBOUNCE_MS)
  }

  function cancelDraft() {
    clearTimeout(draftTimer)
    writeDraft = null
  }

  // Writes a pending draft now instead of after the debounce; resolves once it is stored.
  function flushDraft() {
    clearTimeout(draftTimer)
    return writeDraft?.() ?? draftWrite ?? Promise.resolve()
  }
  // Leaving or hiding the page writes the pending draft, so a reload right after typing keeps it.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft() })
  window.addEventListener('pagehide', () => flushDraft())

  // Replaces the working copy and shows it in the editor (no draft write, no run).
  // `newHistory` starts the editor's undo history over.
  function setWorkingCopy(cur, { newHistory = false } = {}) {
    code = cur.code
    work = { mode: cur.mode ?? 'auto', runMode: cur.runMode ?? 'auto', settings: clone(cur.settings ?? DEFAULT_CREATION_SETTINGS) }
    clearTimeout(changeTimer)
    editor.setCode(code, { silent: true, newHistory })
    editor.setLanguage?.(concreteMode())
    setError(null)
  }

  // --- Runner ---

  function destroyRunner() {
    runner?.destroy()
    runner = null
    runnerKey = ''
  }

  // Anything baked into a runner at creation; a change means a new runner.
  const wantedKey = () => JSON.stringify([concreteMode(), resolvedRunMode(),
    work.settings.canvasWidth, work.settings.canvasHeight, background()])

  function ensureRunner() {
    const key = wantedKey()
    if (runner && key === runnerKey) return
    destroyRunner()
    const r = createRunner({
      container, mode: concreteMode(), runMode: resolvedRunMode(),
      width: work.settings.canvasWidth, height: work.settings.canvasHeight, background: background(),
    })
    if (image) r.setImage(image) // kept by the runner and sent after each load
    r.onAsyncError(e => {
      if (r !== runner) return
      setError(e)
      emitState()
    })
    runner = r
    runnerKey = key
  }

  async function restart() {
    flushDraft() // stored before the code runs, in case it hangs the page
    clearTimeout(changeTimer)
    if (suspended) {
      generation++ // a reply still in flight is for the old code
      restartPending = true
      return
    }
    setSafeStart(false)
    const gen = ++generation
    const token = busy = {}
    ensureRunner()
    const r = runner
    clock.reset()
    lastStep = -1
    consoleText = ''
    // The old error goes before the load starts: errors raised while a page loads
    // arrive as async errors before the load replies, and must stay.
    setError(null)
    // Play is the intent from the moment the load starts, so a pause or step pressed
    // while it loads sticks instead of being overridden when the load finishes.
    clock.playing = r.supportsTime
    emitState()
    const result = await r.load(code, { loopProtect: r.runMode === 'page' })
    if (busy === token) busy = null
    if (gen !== generation) return
    addConsole(result.console)
    if (result.error) setError(result.error)
    emitState()
  }

  // Runs steps on the current runner. Never skipped: step and seek call it directly.
  async function run(steps) {
    if (suspended || !runner?.supportsTime || safeStart || !steps.length) return
    const gen = generation, r = runner
    const token = busy = {}
    const result = await r.runFrames(steps, { budgetMs: r.runMode === 'worker' ? WORKER_BUDGET_MS : PAGE_BUDGET_MS })
    if (busy === token) busy = null
    if (gen !== generation) return
    lastStep = steps.at(-1)
    addConsole(result.console)
    if (result.error) setError(result.error)
    emitState()
  }

  async function rebuild() {
    if (suspended || safeStart || !runner?.supportsTime || runner.dead || wantedKey() !== runnerKey) return restart()
    flushDraft() // stored before the code runs, in case it hangs the page
    const gen = generation, r = runner
    const wasPausedByError = pausedByError
    setError(null) // new code: the old error no longer applies
    const token = busy = {}
    const result = await r.setCode(code)
    if (busy === token) busy = null
    if (gen !== generation) return
    addConsole(result.console)
    if (result.error) {
      setError(result.error)
      emitState()
      return
    }
    await run([Math.max(lastStep, 0)])
    if (gen === generation && wasPausedByError && !error) {
      clock.playing = true
      emitState()
    }
  }

  function applyChange() {
    if (safeStart) return restart() // the user typed: that counts as consent to run
    if (settings.onChange === 'restart') return restart()
    if (settings.onChange === 'rebuild') return rebuild()
  }

  // Applies a working-copy change that needs a fresh load (mode, run mode, settings).
  function reconfigured() {
    editor.setLanguage?.(concreteMode())
    changed()
    if (!safeStart) restart()
    else emitState()
  }

  // --- Live loop ---

  function loop() {
    requestAnimationFrame(loop)
    if (suspended || busy || safeStart || !clock.playing || !runner?.supportsTime) return
    run(clock.tick())
  }
  requestAnimationFrame(loop)

  // --- API ---

  const session = {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(fn)
      return () => listeners.get(name).delete(fn)
    },

    // Opens a creation. `version` is the last saved version; `draft`, when given,
    // is the working copy to restore. With `safeStart`, page-mode code waits for a click.
    open({ creation: c, version, draft = null, safeStart: safe = false }) {
      creation = { id: c.id ?? null, name: c.name ?? 'untitled' }
      saved = { code: version.code, mode: version.mode, runMode: version.runMode ?? 'auto', settings: clone(version.settings ?? DEFAULT_CREATION_SETTINGS) }
      cancelDraft()
      setWorkingCopy(draft ?? saved, { newHistory: true }) // undo never reaches the previous creation
      emit('codeChanged', { code, modified: isModified() })
      if (safe && resolvedRunMode() === 'page') {
        generation++ // drop anything still in flight for the previous creation
        busy = null
        destroyRunner()
        lastStep = -1
        consoleText = ''
        clock.playing = false
        setSafeStart(true)
        emitState()
        return Promise.resolve()
      }
      return restart()
    },

    // Called by the editor's onChange.
    codeEdited(newCode, { origin = 'api' } = {}) {
      code = newCode
      editor.setLanguage?.(concreteMode())
      changed()
      clearTimeout(changeTimer)
      if (safeStart && origin !== 'user') return
      changeTimer = setTimeout(applyChange, CHANGE_DEBOUNCE_MS)
    },

    restart,
    rebuild,

    togglePause() {
      if (safeStart) return restart()
      if (!runner?.supportsTime) return
      clock.playing = !clock.playing
      pausedByError = false
      emitState()
    },

    step() {
      if (suspended || safeStart || !runner?.supportsTime) return
      const steps = clock.step()
      emitState()
      return run(steps)
    },

    seek(i) {
      if (suspended || safeStart || !runner?.supportsTime) return
      return run(clock.seek(i))
    },

    // The custom image (an ImageBitmap) or null. A paused program redraws its frame.
    async setImage(bitmap) {
      image = bitmap ?? null
      if (!runner) return
      await runner.setImage(image)
      if (!clock.playing && !busy) await run([Math.max(lastStep, 0)])
    },

    setCreationSettings(partial) {
      const next = { ...work.settings, ...partial }
      if (partial.background) next.background = { ...work.settings.background, ...partial.background }
      work.settings = next
      reconfigured()
    },

    setMode(mode) {
      work.mode = mode
      reconfigured()
    },

    setRunMode(runMode) {
      work.runMode = runMode
      reconfigured()
    },

    setName(name) {
      creation.name = name
      const id = creation.id
      if (!library || !id) return Promise.resolve()
      return library.rename(id, name)
        .then(() => emit('renamed', { id, name }))
        .catch(e => console.error('Could not rename', e))
    },

    // The working copy as a version-shaped record {code, mode, runMode, settings}.
    get workingCopy() { return workingCopy() },

    // Loads a version's code and settings as the working copy (a draft on top of
    // the last saved version), writes the draft and runs it.
    loadAsDraft(version) {
      setWorkingCopy(version)
      changed()
      return restart()
    },

    flushDraft,

    // Records `version` (a working copy just stored by library.saveVersion) as saved.
    // Edits made while saving stay modified and get their draft written again.
    markSaved(version) {
      saved = { code: version.code, mode: version.mode, runMode: version.runMode, settings: clone(version.settings) }
      cancelDraft()
      if (isModified()) changed()
      else emit('codeChanged', { code, modified: false })
    },

    // Reverts the working copy to the last saved version and deletes the stored draft.
    async discardDraft() {
      cancelDraft()
      setWorkingCopy(saved)
      emit('codeChanged', { code, modified: false })
      if (library && creation.id) await library.discardDraft(creation.id).catch(e => console.error('Could not discard draft', e))
      return restart()
    },

    // Capture suspends the live view while it runs its own runner: code changes,
    // steps and seeks leave the live runner alone, and a restart asked for meanwhile
    // runs once on resume.
    suspendLive(on) {
      suspended = !!on
      if (!suspended && restartPending) {
        restartPending = false
        restart()
      }
    },

    getRunner: () => runner,

    get code() { return code },
    get mode() { return work.mode },
    get concreteMode() { return concreteMode() },
    get runMode() { return resolvedRunMode() },
    get runModeSetting() { return work.runMode },
    get creationSettings() { return clone(work.settings) },
    get creation() { return { ...creation } },
    get image() { return image }, // the custom image (an ImageBitmap) or null
    get modified() { return isModified() },
    get state() { return state() },
  }
  return session
}
