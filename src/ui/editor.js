// CodeMirror 6 editor with CapJS keys, compressed-dweet paste and an error-line marker.

import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection,
  dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration,
} from '@codemirror/view'
import { EditorState, Compartment, StateEffect, StateField, Prec } from '@codemirror/state'
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { autocompletion, completeAnyWord, completionKeymap } from '@codemirror/autocomplete'
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
  let language = languageKey('dweet')
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
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        autocompletion({ override: [completeAnyWord], activateOnTyping: false }),
        keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
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
    setCode(code, { silent: quiet = false } = {}) {
      silent = quiet
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } })
      } finally {
        silent = false
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
    setLanguage(mode) {
      if (languageKey(mode) === language) return
      language = languageKey(mode)
      view.dispatch({ effects: languageConf.reconfigure(LANGUAGES[language]()) })
    },
    markError(line) {
      view.dispatch({ effects: setErrorLine.of(line ?? null) })
    },
    focus: () => view.focus(),
  }
  editor.setFontSize(fontSize)
  return editor
}
