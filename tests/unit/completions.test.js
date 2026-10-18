import { test, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import { html } from '@codemirror/lang-html'
import { capjsCompletions } from '../../src/ui/completions.js'

// Runs the CapJS completion source as Ctrl+Space would, with the cursor at the end of `doc`.
async function complete(mode, doc) {
  const state = EditorState.create({ doc, extensions: mode === 'html' ? [html()] : [] })
  const result = await capjsCompletions(() => mode)(new CompletionContext(state, doc.length, true))
  return result && { from: result.from, labels: result.options.map(o => o.label), options: result.options }
}

test('after x. a dweet gets the hand-picked canvas members with their arguments', async () => {
  const r = await complete('dweet', 'c.width|=0;x.fi')
  expect(r.from).toBe('c.width|=0;x.'.length)
  expect(r.labels).toEqual(expect.arrayContaining(['fillRect', 'fillStyle', 'fillText', 'filter', 'beginPath', 'globalAlpha']))
  expect(r.labels.length).toBeLessThan(70) // a short list, not every canvas member
  expect(r.options.find(o => o.label === 'fillRect').detail).toBe('(x, y, w, h)')
})
test('dweet globals with their meaning, Math members, canvas members', async () => {
  const g = await complete('dweet', 'x.fillRect(0,0,')
  expect(g.labels).toEqual(expect.arrayContaining(['S', 'C', 'T', 'R', 't', 'c', 'x', 'frame', 'time', 'PI', 'image', 'DrawImage']))
  expect(g.options.find(o => o.label === 'R').detail).toBe('(r, g, b, a) → rgba string')
  expect((await complete('dweet', 'Math.')).labels).toEqual(expect.arrayContaining(['sin', 'hypot', 'PI']))
  expect((await complete('dweet', 'c.')).labels).toEqual(expect.arrayContaining(['width', 'height', 'style']))
})
test('Shadertoy gets uniforms and GLSL built-ins, not the canvas', async () => {
  const r = await complete('shadertoy', 'void mainImage(out vec4 c, in vec2 p){ c = vec4(iT')
  expect(r.labels).toEqual(expect.arrayContaining(['iTime', 'iTimeDelta', 'iResolution', 'iMouse', 'iChannel0', 'smoothstep', 'mix', 'vec3']))
  expect(r.labels).not.toContain('fillRect')
  expect(await complete('shadertoy', 'x.')).toBeNull()
})
test('three.js gets THREE classes after THREE.', async () => {
  const r = await complete('three', 'm=new THREE.Me')
  expect(r.labels).toEqual(expect.arrayContaining(['Mesh', 'MeshBasicMaterial', 'Vector3']))
  expect((await complete('three', 'r')).labels).toEqual(expect.arrayContaining(['THREE', 'renderer']))
})
test('unknown objects and plain words give no CapJS suggestions of their own', async () => {
  expect(await complete('dweet', 'myThing.')).toBeNull()
  expect(await complete('html', '<di')).not.toBeNull() // html tags come from the html language
})
