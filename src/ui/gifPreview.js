// The GIF preview overlay: the finished GIF, its size, a warning over the size
// limit, and Download. Nothing is saved until Download is clicked.

import { downloadBlob } from './download.js'

export function createGifPreview() {
  const $ = id => document.getElementById(id)
  const overlay = $('gif-preview'), image = $('gif-image'), size = $('gif-size'), warning = $('gif-warning')
  let current = null // {blob, filename, url}

  function close() {
    if (!current) return
    overlay.hidden = true
    image.removeAttribute('src')
    URL.revokeObjectURL(current.url)
    current = null
  }

  $('btn-gif-download').addEventListener('click', () => current && downloadBlob(current.blob, current.filename))
  $('btn-gif-close').addEventListener('click', close)
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && current) close() })

  return {
    open({ blob, overLimit, filename }) {
      close()
      current = { blob, filename, url: URL.createObjectURL(blob) }
      image.src = current.url
      size.textContent = `${(blob.size / 1e6).toFixed(2)} MB`
      warning.hidden = !overLimit
      overlay.hidden = false
    },
    close,
  }
}
