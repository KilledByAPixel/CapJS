// Stops the browser from opening a dropped file (its default) wherever no handler took
// the drop: shows a "no drop" cursor there and cancels the drop. Handlers that accept
// files call preventDefault first, so they're left alone.

const isFileDrag = e => [...(e.dataTransfer?.types ?? [])].includes('Files')

export function blockUnhandledFileDrops(win = window) {
  win.addEventListener('dragover', e => {
    if (!isFileDrag(e) || e.defaultPrevented) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'none'
  })
  win.addEventListener('drop', e => {
    if (isFileDrag(e) && !e.defaultPrevented) e.preventDefault()
  })
}
