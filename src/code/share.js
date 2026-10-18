// Share links. New links carry {name, mode, code} as deflate-compressed JSON in one URL-safe
// param, `s` (about 20-30% shorter than the old JSONCrush links for dweets, half for big
// programs). Old ?filename=&mode=&crushed= and ?code= links still load.

import { JSONUncrush } from '../vendor/jsoncrush.js'

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
export async function parseShareUrl(href) {
  const params = new URL(href).searchParams
  if (params.has('s')) {
    try {
      const json = new TextDecoder().decode(await pipe(fromBase64Url(params.get('s')), new DecompressionStream('deflate-raw')))
      const { n, m, c } = JSON.parse(json)
      return typeof c === 'string' ? { name: n ?? null, mode: m ?? null, code: c } : null
    } catch {
      return null
    }
  }
  if (!params.has('crushed') && !params.has('code')) return null
  const code = params.has('crushed') ? JSONUncrush(params.get('crushed')) : params.get('code')
  return { name: params.get('filename'), mode: params.get('mode'), code }
}
