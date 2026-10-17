import { test, expect, vi } from 'vitest'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/app/settings.js'
const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v } } }
test('defaults, deep merge, corrupt JSON', () => {
  const s = mem()
  expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS)
  saveSettings({ ...DEFAULT_SETTINGS, capture: { fps: 30 } }, s)
  expect(loadSettings(s).capture).toEqual({ ...DEFAULT_SETTINGS.capture, fps: 30 })
  s.setItem('capjs.settings', '{nope'); expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS)
})
test('blocked storage: load falls back to defaults and save does not throw', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const blocked = { getItem() { throw new DOMException('denied', 'SecurityError') }, setItem() { throw new DOMException('denied', 'SecurityError') } }
  expect(loadSettings(blocked)).toEqual(DEFAULT_SETTINGS)
  expect(() => saveSettings(DEFAULT_SETTINGS, blocked)).not.toThrow()
  // No storage at all (the default parameter must not be read outside the guard).
  expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  expect(() => saveSettings(DEFAULT_SETTINGS, undefined)).not.toThrow()
  expect(warn).toHaveBeenCalledTimes(2)
  warn.mockRestore()
})
test('a stored non-object never replaces an object default', () => {
  const s = mem()
  s.setItem('capjs.settings', JSON.stringify({ capture: 5, theme: 'dark' }))
  expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' })
  s.setItem('capjs.settings', JSON.stringify({ capture: null }))
  expect(loadSettings(s).capture).toEqual(DEFAULT_SETTINGS.capture)
  s.setItem('capjs.settings', JSON.stringify({ capture: [1] }))
  expect(loadSettings(s).capture).toEqual(DEFAULT_SETTINGS.capture)
})
