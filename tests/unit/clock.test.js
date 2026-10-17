import { test, expect } from 'vitest'
import { createClock } from '../../src/app/clock.js'
test('speed 1, 0.5, 2', () => {
  let c = createClock(); c.playing = true
  expect([c.tick(), c.tick(), c.tick()]).toEqual([[0], [1], [2]])
  c = createClock(); c.playing = true; c.speed = 0.5
  expect([c.tick(), c.tick(), c.tick()]).toEqual([[0], [], [1]])
  c = createClock(); c.playing = true; c.speed = 2
  expect([c.tick(), c.tick()]).toEqual([[0, 1], [2, 3]])
})
test('pause, step, seek, reset, clamping', () => {
  const c = createClock()
  expect(c.tick()).toEqual([])
  c.playing = true; c.tick(); expect(c.step()).toEqual([1]); expect(c.playing).toBe(false)
  expect(c.seek(120)).toEqual([120]); expect(c.frame).toBe(121); expect(c.time).toBeCloseTo(121 / 60)
  c.reset(); expect(c.frame).toBe(0)
  c.speed = 500; expect(c.speed).toBe(100); c.speed = NaN; expect(c.speed).toBe(0)
})
