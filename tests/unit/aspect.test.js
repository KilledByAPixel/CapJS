import { test, expect } from 'vitest'
import { computeDrawRect } from '../../src/capture/aspect.js'
test('aspect modes map 1920x1080 into 800x600', () => {
  const r = a => Object.fromEntries(Object.entries(computeDrawRect(1920, 1080, 800, 600, a)).map(([k, v]) => [k, +v.toFixed(2)]))
  expect(r('fill')).toEqual({ x: -133.33, y: 0, w: 1066.67, h: 600 })
  expect(r('fit')).toEqual({ x: 0, y: 75, w: 800, h: 450 })
  expect(r('center')).toEqual({ x: -560, y: -240, w: 1920, h: 1080 })
  expect(r('stretch')).toEqual({ x: 0, y: 0, w: 800, h: 600 })
})
