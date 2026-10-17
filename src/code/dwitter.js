// Dwitter code utilities: 2-in-1 character compression, conservative minify, counting.

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

export function countChars(code) {
  return [...code].length
}

export function countBytes(code) {
  return new TextEncoder().encode(code).length
}
