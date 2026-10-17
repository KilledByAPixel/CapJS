// Mode detection and run-mode resolution for editor code.

export function detectMode(code) {
  if (/THREE/.test(code)) return 'three'
  if (/void\s+mainImage/.test(code)) return 'shadertoy'
  if (code.trim().startsWith('<')) return 'html'
  if (/\b(engineInit|gameInit|gameUpdate|gameRender|EngineObject|drawTile)\b/.test(code)) return 'littlejs'
  return 'dweet'
}

export function effectiveMode(selected, code) {
  return selected === 'auto' ? detectMode(code) : selected
}

const FULL_PAGE = /\bdocument\b|\.style\b|\bwindow\b|\bbody\b|\balert\s*\(|\bnew\s+Image\b|\bAudio(Context)?\b|\bspeechSynthesis\b|\baddEventListener\b|\bon(click|mouse\w*|key\w*|pointer\w*)\s*=/

export function needsFullPage(code) {
  return FULL_PAGE.test(code)
}

export function resolveRunMode(mode, runModeSetting, code) {
  if (mode === 'html' || mode === 'js' || mode === 'littlejs') return 'page'
  if (runModeSetting === 'worker' || runModeSetting === 'page') return runModeSetting
  return needsFullPage(code) ? 'page' : 'worker'
}
