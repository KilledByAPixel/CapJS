// Walks a GIF's block structure (no pixel decoding) for tests.
// parseGif(bytes) → {header, width, height, globalColorTable, loopCount,
//   frames: [{delayCs, transparentIndex, disposal, localColorTable}]}

export function parseGif(bytes) {
  let p = 0
  const u8 = () => bytes[p++]
  const u16 = () => { const v = bytes[p] | bytes[p + 1] << 8; p += 2; return v }
  const subBlocks = (keep = false) => { // skips the sub-blocks; with `keep`, returns their data
    const parts = []
    for (let size = u8(); size; size = u8()) { if (keep) parts.push(...bytes.subarray(p, p + size)); p += size }
    return parts
  }

  const header = String.fromCharCode(...bytes.subarray(0, 6)); p = 6
  const width = u16(), height = u16(), packed = u8(); p += 2
  const globalColorTable = !!(packed & 0x80)
  if (globalColorTable) p += 3 * (1 << ((packed & 7) + 1))

  let loopCount = null, gce = null
  const frames = []
  for (;;) {
    if (p >= bytes.length) throw new Error('GIF ended without a trailer')
    const block = u8()
    if (block === 0x3B) break
    if (block === 0x21) {
      const label = u8()
      if (label === 0xF9) {
        p++ // block size (4)
        const f = u8(), delayCs = u16(), ti = u8()
        p++ // terminator
        gce = { delayCs, transparentIndex: f & 1 ? ti : null, disposal: (f >> 2) & 7 }
      } else if (label === 0xFF) {
        const size = u8()
        const id = String.fromCharCode(...bytes.subarray(p, p + size)); p += size
        const data = subBlocks(true)
        if (id === 'NETSCAPE2.0' && data[0] === 1) loopCount = data[1] | data[2] << 8
      } else subBlocks()
    } else if (block === 0x2C) {
      p += 8 // x, y, w, h
      const f = u8()
      const localColorTable = !!(f & 0x80)
      if (localColorTable) p += 3 * (1 << ((f & 7) + 1))
      p++ // LZW minimum code size
      subBlocks()
      frames.push({ delayCs: 0, transparentIndex: null, disposal: 0, ...gce, localColorTable })
      gce = null
    } else throw new Error(`Unknown GIF block 0x${block.toString(16)} at ${p - 1}`)
  }
  return { header, width, height, globalColorTable, loopCount, frames }
}
