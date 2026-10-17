import { test, expect } from 'vitest'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/app/settings.js'
const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v } } }
test('defaults, deep merge, corrupt JSON', () => {
  const s = mem()
  expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS)
  saveSettings({ ...DEFAULT_SETTINGS, capture: { fps: 30 } }, s)
  expect(loadSettings(s).capture).toEqual({ ...DEFAULT_SETTINGS.capture, fps: 30 })
  s.setItem('capjs.settings', '{nope'); expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS)
})
