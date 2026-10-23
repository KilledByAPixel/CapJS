// Share links carry {name, mode, code} as deflate-compressed JSON (the browser's
// CompressionStream) in one URL-safe param, `s`.

const toBase64Url = bytes => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0))

const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())

export async function buildShareUrl(baseHref, { name, mode, code }) {
  const payload = { n: name, c: code }
  if (mode && mode !== 'auto') payload.m = mode
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('deflate-raw'))
  const url = new URL(baseHref)
  url.hash = ''
  url.search = 's=' + toBase64Url(packed)
  return url.toString()
}

// {name, mode, code}, with mode null for auto; null when the URL holds no program or a damaged one.
// Besides Share links (?s=), a plain ?code=…&filename=…&mode=… opens readable code: the simple
// way for other tools (the Dweetabase's CapJS button) to open a program here.
export async function parseShareUrl(href) {
  const params = new URL(href).searchParams
  if (params.has('code')) return { name: params.get('filename'), mode: params.get('mode'), code: params.get('code') }
  if (!params.has('s')) return null
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(params.get('s')), new DecompressionStream('deflate-raw')))
    const { n, m, c } = JSON.parse(json)
    return typeof c === 'string' ? { name: n ?? null, mode: m ?? null, code: c } : null
  } catch {
    return null
  }
}
