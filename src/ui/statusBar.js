// Status row: character, line and byte counts, plus Compress and Minify.

import { compress, minify, countChars, countBytes } from '../code/dwitter.js'

export const DWEET_LIMIT = 140
const CODE_TOOL_MODES = ['dweet', 'js', 'three']

export function createStatusBar({ session, editor }) {
  const $ = id => document.getElementById(id)
  const chars = $('char-count'), lines = $('line-count'), bytes = $('byte-count')
  const compressBtn = $('btn-compress'), minifyBtn = $('btn-minify')
  const titles = { compress: compressBtn.title, minify: minifyBtn.title }

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
    compressBtn.disabled = minifyBtn.disabled = !usable
    compressBtn.title = titles.compress + why
    minifyBtn.title = titles.minify + why
  }
  session.on('codeChanged', update)

  const replace = fn => () => {
    if (!CODE_TOOL_MODES.includes(session.concreteMode)) return
    const next = fn(session.code)
    if (next !== session.code) editor.setCode(next)
  }
  compressBtn.addEventListener('click', replace(compress))
  minifyBtn.addEventListener('click', replace(minify))
}
