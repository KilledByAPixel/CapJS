// Status row: character, line and byte counts, plus Compress, Minify and Beautify.

import { compress, minify, beautify, countChars, countBytes } from '../code/dwitter.js'

export const DWEET_LIMIT = 140
const CODE_TOOL_MODES = ['dweet', 'js', 'three']

export function createStatusBar({ session, editor }) {
  const $ = id => document.getElementById(id)
  const chars = $('char-count'), lines = $('line-count'), bytes = $('byte-count')
  const tools = [[$('btn-compress'), compress], [$('btn-minify'), minify], [$('btn-beautify'), beautify]]
  const titles = new Map(tools.map(([btn]) => [btn, btn.title]))

  function update({ code }) {
    const n = countChars(code)
    const dweet = session.concreteMode === 'dweet'
    chars.textContent = dweet ? `${n} / ${DWEET_LIMIT}` : String(n)
    chars.classList.toggle('over', dweet && n > DWEET_LIMIT)
    const lineCount = code.split('\n').length
    lines.textContent = `${lineCount} line${lineCount === 1 ? '' : 's'}`
    const b = countBytes(code)
    bytes.textContent = `${b} byte${b === 1 ? '' : 's'}`
    const usable = CODE_TOOL_MODES.includes(session.concreteMode)
    const why = usable ? '' : ` (not available in ${session.concreteMode} mode)`
    for (const [btn] of tools) {
      btn.disabled = !usable
      btn.title = titles.get(btn) + why
    }
  }
  session.on('codeChanged', update)

  const replace = fn => () => {
    if (!CODE_TOOL_MODES.includes(session.concreteMode)) return
    const next = fn(session.code)
    if (next !== session.code) editor.setCode(next)
  }
  for (const [btn, fn] of tools) btn.addEventListener('click', replace(fn))
}
