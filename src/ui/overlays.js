// Escape for overlays (help, gallery, history, GIF preview): one key press closes
// only the topmost open overlay. Topmost is the highest z-index, then the latest
// in document order (which is how the browser stacks them).

const overlays = [] // {element, isOpen, close}

const zIndex = el => Number.parseInt(getComputedStyle(el).zIndex, 10) || 0
const above = (a, b) => zIndex(a) - zIndex(b) ||
  (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1)

function onKeydown(e) {
  if (e.key !== 'Escape') return
  const open = overlays.filter(o => o.isOpen())
  if (!open.length) return
  const top = open.reduce((a, b) => (above(b.element, a.element) > 0 ? b : a))
  e.preventDefault()
  e.stopImmediatePropagation()
  top.close()
}

// Registers an overlay. `isOpen` defaults to "the element is not hidden".
export function closeOnEscape(element, close, isOpen = () => !element.hidden) {
  if (!overlays.length) window.addEventListener('keydown', onKeydown)
  overlays.push({ element, isOpen, close })
}
