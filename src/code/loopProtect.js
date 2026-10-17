// Loop buster: inserts a guard call into for/while loop heads, inline only.
// Never adds or removes newlines, so error line numbers stay intact.

import { mask } from './mask.js'

// Index of the ")" matching the "(" at `open` in masked code, or -1.
function matchParen(code, open) {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++
    else if (code[i] === ')' && --depth === 0) return i
  }
  return -1
}

// Top-level ";" positions within masked code[from, to).
function topLevelSemis(code, from, to) {
  const semis = []
  let depth = 0
  for (let i = from; i < to; i++) {
    const c = code[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ';' && depth === 0) semis.push(i)
  }
  return semis
}

export function wrapLoops(code, guard = '__lg()') {
  const masked = mask(code)
  const head = /\b(for|while)\s*\(/g
  const inserts = [] // [position, text], found in ascending order of loop head
  let m
  while ((m = head.exec(masked))) {
    const open = m.index + m[0].length - 1
    const close = matchParen(masked, open)
    if (close < 0) continue // unmatched paren: skip this head, keep scanning
    if (m[1] === 'while') {
      inserts.push([open + 1, guard + ','])
    } else {
      const semis = topLevelSemis(masked, open + 1, close)
      if (semis.length !== 2) continue // for-of / for-in: leave alone
      const at = semis[1] + 1
      inserts.push([at, guard + (masked.slice(at, close).trim() ? ',' : '')])
    }
  }
  // Nested heads can be found after their enclosing head, so apply in position order.
  inserts.sort((a, b) => a[0] - b[0])
  let out = ''
  let last = 0
  for (const [at, text] of inserts) {
    out += code.slice(last, at) + text
    last = at
  }
  return out + code.slice(last)
}

// Script types that hold JavaScript; any other type (e.g. a shader) is data.
const JS_TYPE = /^(|module|(text|application)\/(java|ecma)script)$/i

// Applies wrapLoops to the bodies of inline JavaScript <script> elements in an
// HTML document. Scripts with src, other script types and markup are left alone.
export function wrapHtmlScripts(html, guard = '__lg()') {
  return html.replace(/(<script\b([^>]*)>)([\s\S]*?)(<\/script\s*>)/gi, (all, open, attrs, body, close) => {
    if (/\bsrc\s*=/i.test(attrs)) return all
    const type = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs)
    if (type && !JS_TYPE.test((type[1] ?? type[2] ?? type[3]).trim())) return all
    return open + wrapLoops(body, guard) + close
  })
}
