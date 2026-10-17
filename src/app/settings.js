// App-level settings persisted in localStorage.

export const SETTINGS_KEY = 'capjs.settings'

export const DEFAULT_SETTINGS = {
  theme: 'capjs',
  fontSize: 2.0,
  onChange: 'restart',
  sidebarOpen: true,
  currentCreationId: null,
  capture: {
    format: 'gif',
    width: 960,
    height: 540,
    seconds: 2,
    fps: 60,
    dither: 'fs',
    speed: 1,
    aspect: 'fill',
  },
}

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// Recursively merges `over` onto `base`; nested plain objects merge key by key.
function deepMerge(base, over) {
  const out = { ...base }
  for (const key of Object.keys(over)) {
    const v = over[key]
    out[key] = isPlainObject(v) && isPlainObject(base[key]) ? deepMerge(base[key], v) : v
  }
  return out
}

export function loadSettings(storage = localStorage) {
  const defaults = structuredClone(DEFAULT_SETTINGS)
  let stored
  try {
    stored = JSON.parse(storage.getItem(SETTINGS_KEY))
  } catch {
    return defaults
  }
  return isPlainObject(stored) ? deepMerge(defaults, stored) : defaults
}

export function saveSettings(settings, storage = localStorage) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
