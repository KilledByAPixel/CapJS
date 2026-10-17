// Copy of code with comment and string contents blanked (same length, newlines kept),
// so scanners never see code-like text inside them.
export function mask(code) {
  const blank = s => s.replace(/[^\n]/g, ' ')
  return code.replace(/\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?|`(?:\\[\s\S]|[^`\\])*`?/g, blank)
}
