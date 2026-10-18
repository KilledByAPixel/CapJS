// CodeMirror 6 editor with CapJS keys, compressed-dweet paste and an error-line marker.

import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection,
  dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration,
} from '@codemirror/view'
import { EditorState, Compartment, StateEffect, StateField, Prec } from '@codemirror/state'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { history, defaultKeymap, historyKeymap, indentWithTab, insertNewline } from '@codemirror/commands'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { autocompletion, completeAnyWord, completionKeymap } from '@codemirror/autocomplete'
import { capjsCompletions } from './completions.js'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { cpp } from '@codemirror/lang-cpp'
import { THEMES } from './themes.js'
import { isCompressed, uncompress } from '../code/dwitter.js'

// --- Error line marker ---

const setErrorLine = StateEffect.define()
const errorLineDeco = Decoration.line({ class: 'cm-errorLine' })
const errorLineField = StateField.define({
  create: () => Decoration.none,
  update(decos, tr) {
    decos = decos.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(setErrorLine)) continue
      const n = e.value
      decos = n && n >= 1 && n <= tr.state.doc.lines
        ? Decoration.set([errorLineDeco.range(tr.state.doc.line(n).from)])
        : Decoration.none
    }
    return decos
  },
  provide: f => EditorView.decorations.from(f),
})

// Pasting a compressed dweet into an empty editor inserts it uncompressed.
const uncompressPaste = EditorState.transactionFilter.of(tr => {
  if (!tr.isUserEvent('input.paste') || tr.startState.doc.length) return tr
  const text = tr.newDoc.toString()
  if (!isCompressed(text)) return tr
  const code = uncompress(text)
  return { changes: { from: 0, insert: code }, selection: { anchor: code.length }, userEvent: 'input.paste', scrollIntoView: true }
})

const LANGUAGES = { html, cpp, javascript }
const languageKey = mode => mode === 'html' ? 'html' : mode === 'shadertoy' ? 'cpp' : 'javascript'

export function createEditor(parent, { theme = 'capjs', fontSize = 2, onChange = () => {}, keys = {} } = {}) {
  const themeConf = new Compartment()
  const languageConf = new Compartment()
  const historyConf = new Compartment()
  let language = languageKey('dweet')
  let mode = 'dweet' // the concrete program type, for Ctrl+Space suggestions
  let silent = false

  const run = fn => () => { fn?.(); return true }
  const capjsKeys = Prec.highest(keymap.of([
    { key: 'Alt-ArrowUp', run: run(keys.pause) },
    { key: 'Alt-ArrowDown', run: run(keys.restart) },
    { key: 'Alt-Enter', run: run(keys.restart) },
    { key: 'Alt-ArrowRight', run: run(keys.step) },
    { key: 'Mod-s', run: run(keys.save), preventDefault: true },
  ]))

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: '',
      extensions: [
        capjsKeys,
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        historyConf.of(history()),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        highlightSelectionMatches(),
        // The list only opens on Ctrl+Space, so Enter may accept at once (no interaction delay).
        autocompletion({ override: [capjsCompletions(() => mode), completeAnyWord], activateOnTyping: false, interactionDelay: 0 }),
        // Enter is a plain newline: no automatic indentation (the original CapJS had smartIndent off)
        keymap.of([{ key: 'Enter', run: insertNewline }, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
        uncompressPaste,
        errorLineField,
        languageConf.of(LANGUAGES[language]()),
        themeConf.of(THEMES[theme] ?? THEMES.capjs),
        EditorView.updateListener.of(update => {
          if (!update.docChanged || silent) return
          const user = update.transactions.some(tr => tr.isUserEvent('input') || tr.isUserEvent('delete')
            || tr.isUserEvent('move') || tr.isUserEvent('undo') || tr.isUserEvent('redo'))
          onChange(view.state.doc.toString(), { origin: user ? 'user' : 'api' })
        }),
      ],
    }),
  })

  const editor = {
    view,
    getCode: () => view.state.doc.toString(),
    // With `newHistory`, undo history starts over (another creation was opened).
    setCode(code, { silent: quiet = false, newHistory = false } = {}) {
      silent = quiet
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } })
      } finally {
        silent = false
      }
      if (newHistory) {
        view.dispatch({ effects: historyConf.reconfigure([]) })
        view.dispatch({ effects: historyConf.reconfigure(history()) })
      }
    },
    setTheme(name) {
      view.dispatch({ effects: themeConf.reconfigure(THEMES[name] ?? THEMES.capjs) })
    },
    setFontSize(em) {
      view.dom.style.fontSize = `${em}em`
      view.requestMeasure()
    },
    // Swaps syntax highlighting for a concrete mode (html, shadertoy, or JavaScript for the rest).
    setLanguage(concreteMode) {
      mode = concreteMode
      if (languageKey(mode) === language) return
      language = languageKey(mode)
      view.dispatch({ effects: languageConf.reconfigure(LANGUAGES[language]()) })
    },
    // Highlights the error line and scrolls it into view (null clears it).
    markError(line) {
      const effects = [setErrorLine.of(line ?? null)]
      if (line >= 1 && line <= view.state.doc.lines)
        effects.push(EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'nearest' }))
      view.dispatch({ effects })
    },
    focus: () => view.focus(),
  }
  editor.setFontSize(fontSize)
  return editor
}
