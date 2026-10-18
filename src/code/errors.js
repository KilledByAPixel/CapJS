// Turns thrown errors into what the error box shows: the message with its name, the editor
// line and column, and the chain of user-code frames.

import { parse } from 'acorn'

// Lines the runtime's Function wrapper adds before the user's code.
export const DWEET_LINE_OFFSET = 2

export function parseErrorLine(stack, offset = DWEET_LINE_OFFSET) {
  const m = /<anonymous>:(\d+):\d+/.exec(stack || '')
  if (!m) return null
  const line = +m[1] - offset
  return line < 1 ? null : line
}

// Stack frames that point into user code (eval'd or new Function code is "<anonymous>").
// "eval" and "anonymous" are the top level of the user's code, so they get no name.
function userFrames(stack, offset) {
  const frames = []
  for (const text of String(stack ?? '').split('\n')) {
    const m = /^\s*at (?:(.*?) \()?(?:eval at .*, )?<anonymous>:(\d+):(\d+)\)?\s*$/.exec(text)
    if (!m) continue
    const line = +m[2] - offset
    if (line < 1) continue
    const fn = m[1]?.replace(/^async /, '')
    frames.push({ fn: !fn || fn === 'eval' || fn === 'anonymous' ? null : fn, line, column: +m[3] })
  }
  return frames
}

// Where a syntax error is, found by parsing the user's original code (Chrome reports no
// line for syntax errors in new Function or eval code). Null when the parser accepts it.
export function locateSyntaxError(code) {
  try {
    parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true })
    return null
  } catch (e) {
    if (!e?.loc) return null
    return { line: e.loc.line, column: e.loc.column + 1, message: String(e.message).replace(/\s*\(\d+:\d+\)$/, '') }
  }
}

// {message, line, column, stack}: stack lists the user-code frames only when there is more
// than one, since a single frame is already the line and column. An explicit line (from
// window.onerror) wins; `code` lets a syntax error be located; `offset` is the wrapper's lines.
export function describeError(e, { offset = DWEET_LINE_OFFSET, code = null, line = null, column = null } = {}) {
  const name = e?.name
  const raw = e?.message ?? (e === undefined ? 'undefined' : String(e))
  const message = name && name !== 'Error' && !raw.startsWith(name) ? `${name}: ${raw}` : raw
  const frames = userFrames(e?.stack, offset)
  let loc = line != null ? { line, column: column || null } : frames[0] ?? null
  if (!loc && name === 'SyntaxError' && code != null) loc = locateSyntaxError(code)
  return { message, line: loc?.line ?? null, column: loc?.column ?? null, stack: frames.length > 1 ? frames : [] }
}

const where = ({ line, column }) => line ? `Line:${line}` + (column ? `, Column:${column}` : '') : ''

// What the error box shows: {head, frames}, or null for no error.
export function formatError(error) {
  if (!error) return null
  return {
    head: error.line ? `${error.message} (${where(error)})` : error.message,
    frames: (error.stack ?? []).map(f => f.fn ? `at ${f.fn} (${where(f)})` : `at ${where(f)}`),
  }
}
