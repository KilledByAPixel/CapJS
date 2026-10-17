// App-level settings persisted in localStorage. Storage may be blocked (a
// SecurityError on access): then the defaults are used and nothing is persisted.

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
// An object default is kept when the stored value is not a plain object.
function deepMerge(base, over) {
  const out = { ...base }
  for (const key of Object.keys(over)) {
    const v = over[key]
    if (!isPlainObject(base[key])) out[key] = v
    else if (isPlainObject(v)) out[key] = deepMerge(base[key], v)
  }
  return out
}

// `storage` defaults to localStorage, looked up inside the guard: merely reading
// window.localStorage throws when storage is blocked.
export function loadSettings(storage) {
  const defaults = structuredClone(DEFAULT_SETTINGS)
  let stored
  try {
    stored = JSON.parse((storage ?? globalThis.localStorage).getItem(SETTINGS_KEY))
  } catch {
    return defaults
  }
  return isPlainObject(stored) ? deepMerge(defaults, stored) : defaults
}

export function saveSettings(settings, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    console.warn('Could not save settings', e)
  }
}
