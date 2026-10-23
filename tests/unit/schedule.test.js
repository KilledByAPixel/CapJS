import { test, expect } from 'vitest'
import * as schedule from '../../src/capture/schedule.js'
const { captureTargets, gifDelays, estimateCaptureBytes } = schedule
test('targets', () => {
  expect(captureTargets({ seconds: 0.1, fps: 60, speed: 1 })).toEqual([0, 1, 2, 3, 4, 5])
  expect(captureTargets({ seconds: 0.1, fps: 30, speed: 1 })).toEqual([0, 2, 4])
  expect(captureTargets({ seconds: 0.1, fps: 50, speed: 1 })).toEqual([0, 1, 2, 3, 4])
  expect(captureTargets({ seconds: 0.1, fps: 30, speed: 0.5 })).toEqual([0, 1, 2])
  expect(captureTargets({ seconds: 2, fps: 60, speed: 1 })).toHaveLength(120)
  expect(captureTargets({ seconds: 0.5, fps: 12, speed: 1 })).toEqual([0, 5, 10, 15, 20, 25]) // any typed fps
})
test('delays follow the fps as typed, with no cap; memory estimate', () => {
  expect(gifDelays(30, 3)).toEqual([30, 40, 30])
  expect(gifDelays(60, 3)).toEqual([20, 10, 20]) // whole hundredths of a second, averaging 60 fps
  expect(gifDelays(12, 2)).toEqual([80, 90])
  expect(schedule.effectiveFps).toBeUndefined()
  expect(schedule.GIF_MAX_FPS).toBeUndefined()
  expect(estimateCaptureBytes({ width: 960, height: 540, seconds: 2, fps: 60 })).toBe(960 * 540 * 4 * 120)
})
