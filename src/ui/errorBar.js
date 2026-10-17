// The red error bar and the console bar under the editor; each is hidden when empty.

export const formatError = error =>
  error ? (error.line ? `Line ${error.line}: ${error.message}` : error.message) : ''

export function createErrorBar({ session, errorEl, consoleEl }) {
  session.on('state', ({ error, console }) => {
    const text = formatError(error)
    if (errorEl.textContent !== text) errorEl.textContent = text
    errorEl.hidden = !text
    if (consoleEl.textContent !== console) {
      consoleEl.textContent = console
      consoleEl.scrollTop = consoleEl.scrollHeight
    }
    consoleEl.hidden = !console
  })
}
