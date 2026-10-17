import { test, expect } from 'vitest'
import { captureTargets, gifDelays, effectiveFps, estimateCaptureBytes } from '../../src/capture/schedule.js'
test('targets', () => {
  expect(captureTargets({ seconds: 0.1, fps: 60, speed: 1 })).toEqual([0, 1, 2, 3, 4, 5])
  expect(captureTargets({ seconds: 0.1, fps: 30, speed: 1 })).toEqual([0, 2, 4])
  expect(captureTargets({ seconds: 0.1, fps: 50, speed: 1 })).toEqual([0, 1, 2, 3, 4])
  expect(captureTargets({ seconds: 0.1, fps: 30, speed: 0.5 })).toEqual([0, 1, 2])
  expect(captureTargets({ seconds: 2, fps: 60, speed: 1 })).toHaveLength(120)
})
test('delays, fps cap, memory estimate', () => {
  expect(gifDelays(30, 3)).toEqual([30, 40, 30])
  expect(gifDelays(50, 2)).toEqual([20, 20])
  expect(effectiveFps('gif', 60)).toBe(50); expect(effectiveFps('webm', 60)).toBe(60)
  expect(estimateCaptureBytes({ width: 960, height: 540, seconds: 2, fps: 60 })).toBe(960 * 540 * 4 * 120)
})
