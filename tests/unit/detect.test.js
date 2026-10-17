import { test, expect } from 'vitest'
import { detectMode, effectiveMode, needsFullPage, resolveRunMode } from '../../src/code/detect.js'
test('detectMode', () => {
  expect(detectMode('x.fillRect(0,0,9,9)')).toBe('dweet')
  expect(detectMode('scene=new THREE.Scene()')).toBe('three')
  expect(detectMode('void mainImage(out vec4 c, in vec2 p){}')).toBe('shadertoy')
  expect(detectMode('  <div>hi</div>')).toBe('html')
  expect(detectMode('function gameInit(){}\nnew EngineObject(vec2(0,0))')).toBe('littlejs')
  expect(effectiveMode('js', 'THREE')).toBe('js')
  expect(effectiveMode('auto', 'THREE')).toBe('three')
})
test('needsFullPage', () => {
  for (const s of ['c.style.filter="blur(9px)"', 'document.body.append(1)', 'window.onclick=f', 'i=new Image', 'new Audio(u)', 'addEventListener("x",f)'])
    expect(needsFullPage(s), s).toBe(true)
  for (const s of ['x.filter="blur(9px)"', 'c.width|=0', 'x.fillStyle=R(9,9,9)', 'stylish=1'])
    expect(needsFullPage(s), s).toBe(false)
})
test('resolveRunMode', () => {
  expect(resolveRunMode('dweet', 'auto', 'x.fillRect(0,0,1,1)')).toBe('worker')
  expect(resolveRunMode('dweet', 'auto', 'c.style.filter="x"')).toBe('page')
  expect(resolveRunMode('dweet', 'page', 'x')).toBe('page')
  expect(resolveRunMode('shadertoy', 'worker', 'x')).toBe('worker')
  for (const m of ['html', 'js', 'littlejs']) expect(resolveRunMode(m, 'worker', 'x')).toBe('page')
})
