// Dwitter code utilities: 2-in-1 character compression, conservative minify, simple beautify, counting.

import { mask } from './mask.js'

const WRAPPER = /eval\(unescape\(escape`([^`]*)`\.replace\(\/u\.\.\/g,(''|"")\)\)\)/

export function compress(code) {
  let text = ''
  for (const ch of code.trim()) {
    text += ch.charCodeAt(0) > 255 ? escape(ch).replace(/%u/g, '\\u') : ch
  }
  if (text.length % 2) text += ';'
  const packed = String.fromCharCode(
    ...[...text].map((e, i) => e.charCodeAt(0) | (i % 2 ? 0xDF00 : 0xDB00)))
  return 'eval(unescape(escape`' + packed + "`.replace(/u../g,'')))"
}

export function uncompress(code) {
  const match = WRAPPER.exec(code)
  if (!match) return code
  let decoded = ''
  // iterate UTF-16 code units, not code points
  for (let i = 0; i < match[1].length; i++)
    decoded += String.fromCharCode(match[1].charCodeAt(i) & 0xFF)
  return code.slice(0, match.index) + decoded + code.slice(match.index + match[0].length)
}

export function isCompressed(code) {
  return WRAPPER.test(code)
}

export function minify(code) {
  return code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//')).join('\n')
}

// Spread squeezed code onto lines: break after top-level ";", after for/while/with/if heads
// with a brace-less body, and around top-level { } blocks, indenting by block depth.
// Text inside ( ), [ ], strings and comments is never touched.
export function beautify(code) {
  code = uncompress(code)
  const m = mask(code)
  const indent = d => '  '.repeat(Math.max(d, 0))
  const rest = i => m.slice(i + 1).replace(/^[ \t]+/, '')
  let out = '', paren = 0, depth = 0, inHead = false
  const breakLine = i => { // newline + indent, swallowing the spaces that followed
    out = out.replace(/[ \t]+$/, '') + '\n' + indent(depth)
    while (code[i + 1] === ' ' || code[i + 1] === '\t') i++
    return i
  }
  for (let i = 0; i < code.length; i++) {
    const c = m[i]
    if (paren === 0 && c === '}') {
      depth--
      if (/\{[ \t]*$/.test(out)) out = out.replace(/[ \t]+$/, '') // empty block stays {}
      else if (/\n[ \t]*$/.test(out)) out = out.replace(/[ \t]*$/, indent(depth))
      else out = out.replace(/[ \t]+$/, '') + '\n' + indent(depth)
    }
    out += code[i]
    if (c === '(' || c === '[') {
      if (paren === 0 && c === '(') inHead = /(^|[^.\w$])(for|while|with|if)\s*$/.test(m.slice(0, i))
      paren++
    }
    else if (c === ')' || c === ']') {
      paren = Math.max(0, paren - 1)
      if (paren === 0 && inHead) {
        inHead = false
        if (!/^(\n|$|[{;])/.test(rest(i))) i = breakLine(i)
      }
    }
    else if (paren > 0) continue
    else if (c === '{') {
      depth++
      if (!/^(\n|$|\})/.test(rest(i))) i = breakLine(i)
    }
    else if (c === ';') {
      if (!/^(\n|$)/.test(rest(i))) i = breakLine(i)
    }
    else if (c === '}') {
      if (!/^(\n|$|[;,)\]]|else\b|catch\b|finally\b|while\b)/.test(rest(i))) i = breakLine(i)
    }
  }
  return out
}

export function countChars(code) {
  return [...code].length
}

export function countBytes(code) {
  return new TextEncoder().encode(code).length
}
