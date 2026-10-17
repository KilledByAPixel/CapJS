// Canvas panel (background, capture aspect, custom image, canvas size), the
// canvas host's image drop target, and the safe-start overlay.
//
// `kv` ({getKV, setKV}, e.g. the library) persists the custom image as kv.lastImage;
// without it the image lasts only for this page.

const MAX_CANVAS = 8192

export function createCanvasPanel({ session, settings, saveSettings, kv = null }) {
  const $ = id => document.getElementById(id)
  const host = $('canvas-host'), safeStart = $('safe-start')
  const bgEnabled = $('bg-enabled'), bgColor = $('bg-color'), aspect = $('cap-aspect')
  const imageInput = $('image-input'), imageName = $('image-name'), imageClear = $('btn-image-clear')
  const width = $('canvas-width'), height = $('canvas-height')

  aspect.value = settings.capture.aspect
  aspect.addEventListener('change', () => {
    settings.capture.aspect = aspect.value
    saveSettings(settings)
  })

  const setBackground = () => session.setCreationSettings({ background: { enabled: bgEnabled.checked, color: bgColor.value } })
  bgEnabled.addEventListener('change', setBackground)
  bgColor.addEventListener('change', setBackground)

  const sizeInput = (input, key) => input.addEventListener('change', () => {
    const n = Math.round(Number(input.value))
    if (n >= 1 && n <= MAX_CANVAS) session.setCreationSettings({ [key]: n })
    else input.value = session.creationSettings[key]
  })
  sizeInput(width, 'canvasWidth')
  sizeInput(height, 'canvasHeight')

  // Reflects the creation's settings (they change on open and on edits here).
  session.on('codeChanged', () => {
    const s = session.creationSettings
    bgEnabled.checked = !!s.background?.enabled
    bgColor.value = s.background?.color ?? '#ffffff'
    width.value = s.canvasWidth
    height.value = s.canvasHeight
    host.style.setProperty('--canvas-w', s.canvasWidth)
    host.style.setProperty('--canvas-h', s.canvasHeight)
  })

  // --- Custom image ---

  function showImage(file) {
    imageName.textContent = file ? (file.name || 'image') : 'none'
    imageName.title = file?.name ?? ''
    imageClear.disabled = !file
  }
  showImage(null)

  async function loadImage(file, { persist = true } = {}) {
    let bitmap
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      alert(`Could not read ${file.name || 'that file'} as an image.`)
      return
    }
    showImage(file)
    await session.setImage(bitmap)
    if (persist) await kv?.setKV('lastImage', file).catch(e => console.error('Could not store image', e))
  }

  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0]
    imageInput.value = ''
    if (file) loadImage(file)
  })
  imageClear.addEventListener('click', async () => {
    showImage(null)
    await session.setImage(null)
    await kv?.setKV('lastImage', null).catch(e => console.error('Could not clear image', e))
  })

  const isFileDrag = e => [...(e.dataTransfer?.types ?? [])].includes('Files')
  host.addEventListener('dragover', e => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    host.classList.add('drop-target')
  })
  host.addEventListener('dragleave', () => host.classList.remove('drop-target'))
  host.addEventListener('drop', e => {
    host.classList.remove('drop-target')
    const file = [...(e.dataTransfer?.files ?? [])].find(f => f.type.startsWith('image/'))
    if (!file) return
    e.preventDefault()
    loadImage(file)
  })

  // --- Safe start ---

  safeStart.addEventListener('click', () => session.restart())

  return {
    showSafeStart(on) { safeStart.hidden = !on },

    // Restores kv.lastImage, if any.
    async restoreImage() {
      const blob = await kv?.getKV('lastImage').catch(() => null)
      if (blob instanceof Blob) await loadImage(blob, { persist: false })
    },
  }
}
