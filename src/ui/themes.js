// Editor themes. `capjs` is ported from the original CapJS editor theme (capjs.css).

import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { oneDark } from '@codemirror/theme-one-dark'

const capjsTheme = EditorView.theme({
  '&': { backgroundColor: '#000', color: '#fff' },
  '.cm-content': { caretColor: '#fff' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid #fff' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: '#3399ff77' },
  '.cm-gutters': { backgroundColor: '#111', color: '#888', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { paddingRight: '10px' },
  '.cm-activeLineGutter': { backgroundColor: '#111', color: '#eee' },
  '.cm-activeLine': { backgroundColor: '#111' },
  '.cm-searchMatch': { backgroundColor: '#ff772233', outline: '1px solid #ff9933' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#ff7722dd', color: '#fff' },
  '&.cm-focused .cm-matchingBracket': { color: '#f0f', backgroundColor: 'transparent' },
  '.cm-tooltip': { backgroundColor: '#111', color: '#ddd', border: '1px solid #444' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#2d3a55', color: '#fff' },
  '.cm-panels': { backgroundColor: '#151515', color: '#ddd' },
}, { dark: true })

const capjsHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#11ff55' },
  { tag: [t.atom, t.bool, t.null, t.special(t.string), t.regexp], color: '#ff9933' },
  { tag: [t.number, t.typeName], color: '#ff5555' },
  { tag: t.definition(t.variableName), color: '#ff77ff' },
  { tag: [t.propertyName, t.variableName], color: '#d4d4d4', fontStyle: 'italic' },
  { tag: t.local(t.variableName), color: '#ffff77', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#fc4384', fontStyle: 'normal' },
  { tag: t.definition(t.propertyName), color: '#fc4384', fontStyle: 'normal' },
  { tag: t.standard(t.variableName), color: '#fc4384' },
  { tag: [t.operator, t.operatorKeyword], color: '#33ccff' },
  { tag: t.tagName, color: '#fc4384' },
  { tag: t.angleBracket, color: '#d4d4d4' },
  { tag: t.attributeName, color: '#a06fca' },
  { tag: t.comment, color: '#696d70', fontStyle: 'italic' },
  { tag: t.string, color: '#e6db74' },
  { tag: t.meta, color: '#d4d4d4' },
  { tag: t.heading, color: '#da7dae' },
  { tag: t.link, color: '#696d70', fontStyle: 'italic' },
  { tag: t.invalid, borderBottom: '1px solid #c42412' },
])

const lightTheme = EditorView.theme({
  '&': { backgroundColor: '#fff', color: '#111' },
  '.cm-gutters': { backgroundColor: '#f2f2f2', color: '#888', border: 'none' },
  '.cm-activeLine': { backgroundColor: '#f4f7ff' },
  '.cm-activeLineGutter': { backgroundColor: '#e6e9f0', color: '#111' },
}, { dark: false })

export const THEMES = {
  capjs: [capjsTheme, syntaxHighlighting(capjsHighlight)],
  'one-dark': oneDark,
  light: [lightTheme, syntaxHighlighting(defaultHighlightStyle)],
}
