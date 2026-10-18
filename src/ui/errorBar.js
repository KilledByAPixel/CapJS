// The error box and the console box under the editor; each is hidden when empty.
// The error box shows the error with its line and column, the chain of user-code
// frames that led there, and a hint for common mistakes.

import { formatError } from '../code/errors.js'

export function createErrorBar({ session, errorEl, consoleEl }) {
  let shown = null
  session.on('state', ({ error, console }) => {
    if (error !== shown) {
      shown = error
      const view = formatError(error)
      const line = (cls, text) => Object.assign(document.createElement('div'), { className: cls, textContent: text })
      errorEl.replaceChildren(...(view ? [
        line('error-head', view.head),
        ...view.frames.map(f => line('error-frame', f)),
        ...(view.hint ? [line('error-hint', view.hint)] : []),
      ] : []))
      errorEl.hidden = !view
    }
    if (consoleEl.textContent !== console) {
      consoleEl.textContent = console
      consoleEl.scrollTop = consoleEl.scrollHeight
    }
    consoleEl.hidden = !console
  })
}
