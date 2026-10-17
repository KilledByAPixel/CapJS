// Loop buster: inserts a guard call into for/while loop heads, inline only.
// Never adds or removes newlines, so error line numbers stay intact.

// Index of the ")" matching the "(" at `open`, or -1. Skips string literals.
function matchParen(code, open) {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    const c = code[i]
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < code.length && code[i] !== c; i++) if (code[i] === '\\') i++
    } else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i
  }
  return -1
}

// Top-level ";" positions within code[from, to).
function topLevelSemis(code, from, to) {
  const semis = []
  let depth = 0
  for (let i = from; i < to; i++) {
    const c = code[i]
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < to && code[i] !== c; i++) if (code[i] === '\\') i++
    } else if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ';' && depth === 0) semis.push(i)
  }
  return semis
}

export function wrapLoops(code, guard = '__lg()') {
  const head = /\b(for|while)\s*\(/g
  let out = ''
  let last = 0
  let m
  while ((m = head.exec(code))) {
    const open = m.index + m[0].length - 1
    const close = matchParen(code, open)
    if (close < 0) break
    let at = -1
    let sep = ','
    if (m[1] === 'while') {
      at = open + 1
    } else {
      const semis = topLevelSemis(code, open + 1, close)
      if (semis.length === 2) {
        at = semis[1] + 1
        if (!code.slice(at, close).trim()) sep = ''
      }
    }
    if (at < 0) continue // for-of / for-in: leave alone, keep scanning inside
    out += code.slice(last, at) + guard + sep
    last = at
  }
  return out + code.slice(last)
}
