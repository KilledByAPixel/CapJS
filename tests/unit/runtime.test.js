// tests/unit/runtime.test.js
import { test, expect, afterEach } from 'vitest'
import { createRuntime } from '../../src/runner/runtime.js'
const fakeCanvas = () => { const calls = []; const ctx = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) }); return { width: 1920, height: 1080, getContext: () => ctx, calls } }
// The runtime runs user code on the real global scope; remove what it and the tests create.
const RUNTIME_GLOBALS = ['c', 'x', 'S', 'C', 'T', 'R', 'PI', 'DrawImage', 'image', '__lg', 't', 'time', 'frame', 'k']
afterEach(() => { for (const k of RUNTIME_GLOBALS) delete globalThis[k] })
const setup = async (code, opts = {}) => {
  const canvas = fakeCanvas(), scope = globalThis
  const rt = createRuntime({ canvas, globalScope: scope, now: opts.now ?? (() => 0) })
  const loaded = await rt.handle({ type: 'load', id: 1, mode: 'dweet', code, width: 1920, height: 1080, background: null, loopProtect: !!opts.loopProtect })
  return { rt, canvas, scope, loaded }
}
test('runs u(t) per step with dweet globals and t = i/60, frame = i+1', async () => {
  const { rt, canvas, scope } = await setup('x.fillRect(S(0),C(0),t*60,frame);console.log(t)')
  const r = await rt.handle({ type: 'frames', id: 2, frames: [0, 1, 2], budgetMs: 100, grab: false })
  expect(r.error).toBeNull()
  expect(canvas.calls.map(c => c.slice(1))).toEqual([[0, 1, 0, 1], [0, 1, 1, 2], [0, 1, 2, 3]])
  expect(r.console).toBe('0\n0.016666666666666666\n0.03333333333333333')
  expect(scope.R(1.7, 2, 3)).toBe('rgba(1,2,3,1)')
})
test('runtime error reports message and editor line, stops the batch', async () => {
  const { rt, canvas } = await setup('x.fillRect(0,0,1,1)\nnope()')
  const r = await rt.handle({ type: 'frames', id: 2, frames: [0, 1], budgetMs: 100, grab: false })
  expect(r.error.message).toMatch(/nope is not defined/)
  expect(r.error.line).toBe(2)
  expect(canvas.calls).toHaveLength(1)
})
test('loop protection throws once the budget is exceeded', async () => {
  let t = 0
  const { rt } = await setup('for(;;){}', { loopProtect: true, now: () => (t += 1) })
  const r = await rt.handle({ type: 'frames', id: 2, frames: [0], budgetMs: 50, grab: false })
  expect(r.error.message).toBe('Loop timed out')
})
test('setCode keeps globals from earlier frames', async () => {
  const { rt, scope } = await setup('frame==1&&(k=0);k++')
  await rt.handle({ type: 'frames', id: 2, frames: [0, 1], budgetMs: 100, grab: false })
  await rt.handle({ type: 'setCode', id: 3, code: 'k+=10' })
  await rt.handle({ type: 'frames', id: 4, frames: [2], budgetMs: 100, grab: false })
  expect(scope.k).toBe(12)
})
