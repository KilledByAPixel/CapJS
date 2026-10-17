import { JSONCrush, JSONUncrush } from '../vendor/jsoncrush.js'

export function buildShareUrl(baseHref, { name, mode, code }) {
  const params = new URLSearchParams()
  params.append('filename', name)
  if (mode !== 'auto') params.append('mode', mode)
  params.append('crushed', JSONCrush(code))
  const url = new URL(baseHref)
  url.hash = ''
  url.search = params.toString()
  return url.toString()
}

export function parseShareUrl(href) {
  const params = new URL(href).searchParams
  if (!params.has('crushed') && !params.has('code')) return null
  const code = params.has('crushed') ? JSONUncrush(params.get('crushed')) : params.get('code')
  return { name: params.get('filename'), mode: params.get('mode'), code }
}
