// Ctrl+Space suggestions that depend on the program type and on what the cursor follows.
// After "obj." only that object's members are offered: the canvas context (a hand-picked list,
// not every member), the canvas, Math, THREE (three.js) and the LittleJS engine. Elsewhere each
// mode offers its own globals. Words already in the code come from a separate source.

import { htmlCompletionSource } from '@codemirror/lang-html'
import { scopeCompletionSource } from '@codemirror/lang-javascript'

const fn = (label, detail, info) => ({ label, detail, info, type: 'function' })
const prop = (label, info) => ({ label, info, type: 'property' })
const variable = (label, info, type = 'variable') => ({ label, info, type })

// The 2D canvas context members a dweet reaches for most, with their arguments.
const CONTEXT_2D = [
  fn('fillRect', '(x, y, w, h)'), fn('strokeRect', '(x, y, w, h)'), fn('clearRect', '(x, y, w, h)'),
  fn('fillText', '(text, x, y)'), fn('strokeText', '(text, x, y)'), fn('measureText', '(text)'),
  fn('beginPath', '()'), fn('closePath', '()'), fn('moveTo', '(x, y)'), fn('lineTo', '(x, y)'),
  fn('arc', '(x, y, r, start, end)'), fn('arcTo', '(x1, y1, x2, y2, r)'),
  fn('ellipse', '(x, y, rx, ry, rotation, start, end)'), fn('rect', '(x, y, w, h)'),
  fn('roundRect', '(x, y, w, h, radius)'), fn('quadraticCurveTo', '(cpx, cpy, x, y)'),
  fn('bezierCurveTo', '(c1x, c1y, c2x, c2y, x, y)'), fn('fill', '()'), fn('stroke', '()'), fn('clip', '()'),
  fn('save', '()'), fn('restore', '()'), fn('translate', '(x, y)'), fn('rotate', '(angle)'),
  fn('scale', '(x, y)'), fn('setTransform', '(a, b, c, d, e, f)'), fn('resetTransform', '()'),
  fn('drawImage', '(image, x, y, w, h)'), fn('getImageData', '(x, y, w, h)'), fn('putImageData', '(data, x, y)'),
  fn('createImageData', '(w, h)'), fn('createLinearGradient', '(x0, y0, x1, y1)'),
  fn('createRadialGradient', '(x0, y0, r0, x1, y1, r1)'), fn('createPattern', '(image, repetition)'),
  fn('setLineDash', '(segments)'),
  prop('fillStyle', 'color, gradient or pattern'), prop('strokeStyle', 'color, gradient or pattern'),
  prop('lineWidth'), prop('lineCap', "'butt' | 'round' | 'square'"), prop('lineJoin', "'miter' | 'round' | 'bevel'"),
  prop('globalAlpha', '0 to 1'), prop('globalCompositeOperation', "'source-over', 'lighter', 'xor', …"),
  prop('font', "e.g. '99px serif'"), prop('textAlign'), prop('textBaseline'), prop('filter', "e.g. 'blur(9px)'"),
  prop('shadowBlur'), prop('shadowColor'), prop('shadowOffsetX'), prop('shadowOffsetY'),
  prop('imageSmoothingEnabled'), prop('canvas'),
]

const CANVAS = [
  prop('width', 'set it (c.width|=0) to clear the canvas'), prop('height'), prop('style', 'page mode only'),
  fn('getContext', '(type)'), fn('toDataURL', '(type)'),
]

const MATH = Object.getOwnPropertyNames(Math).map(name => typeof Math[name] === 'function'
  ? { label: name, type: 'function' } : { label: name, type: 'constant' })

const DWEET_GLOBALS = [
  fn('S', '(a)', 'Math.sin'), fn('C', '(a)', 'Math.cos'), fn('T', '(a)', 'Math.tan'),
  { ...fn('R', '(r, g, b, a) → rgba string'), info: 'R(255,0,0) gives "rgba(255,0,0,1)"' },
  variable('t', 'time in seconds'), variable('c', 'the canvas (1920×1080)'), variable('x', 'the canvas 2D context'),
  variable('frame', 'frame number, from 1'), variable('time', 'time in seconds'), variable('PI', 'Math.PI', 'constant'),
  variable('image', 'the custom image, when loaded'), fn('DrawImage', '(image, x, y, w, h, angle)', 'draws an image centered and rotated'),
]

const THREE_GLOBALS = [
  variable('THREE', 'the three.js library'), variable('renderer', 'a THREE.WebGLRenderer on the canvas'),
  ...DWEET_GLOBALS.filter(o => o.label !== 'x' && o.label !== 'DrawImage'),
]

const GLSL = [
  variable('iResolution', 'vec3: canvas size in pixels'), variable('iTime', 'float: seconds'),
  variable('iTimeDelta', 'float: seconds per frame'), variable('iFrame', 'int: frame number, from 0'),
  variable('iFrameRate', 'float'), variable('iMouse', 'vec4: xy = position while pressed, zw = click'),
  variable('iChannel0', 'sampler2D: the custom image, or the previous frame'),
  fn('mainImage', '(out vec4 fragColor, in vec2 fragCoord)'),
  ...['float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'ivec2', 'mat2', 'mat3', 'mat4', 'sampler2D']
    .map(label => ({ label, type: 'type' })),
  ...['radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'pow', 'exp', 'log', 'exp2', 'log2',
    'sqrt', 'inversesqrt', 'abs', 'sign', 'floor', 'ceil', 'round', 'trunc', 'fract', 'mod', 'min', 'max',
    'clamp', 'mix', 'step', 'smoothstep', 'length', 'distance', 'dot', 'cross', 'normalize', 'reflect',
    'refract', 'texture', 'texelFetch', 'dFdx', 'dFdy', 'fwidth'].map(label => ({ label, type: 'function' })),
  ...['uniform', 'const', 'in', 'out', 'inout', 'void', 'return', 'if', 'else', 'for', 'break', 'continue', 'discard']
    .map(label => ({ label, type: 'keyword' })),
]

// Library names, loaded the first time they're asked for: a promise until then, the list after.
const namesOf = mod => Object.keys(mod).filter(k => k !== 'default').map(name => ({
  label: name,
  type: typeof mod[name] === 'function' ? (/^[A-Z]/.test(name) ? 'class' : 'function') : 'constant',
}))
const lazyNames = load => {
  let names = null, loading = null
  return () => names ?? (loading ??= load().then(namesOf).then(list => names = list))
}
const loadThree = lazyNames(() => import('three'))
const loadLittlejs = lazyNames(() => import('littlejsengine'))

const jsGlobals = typeof window === 'undefined' ? null : scopeCompletionSource(window)

// The members offered after "obj." in a mode, or null when that object isn't known there.
function members(mode, obj) {
  if (obj === 'Math' && mode !== 'shadertoy' && mode !== 'html') return MATH
  if (mode === 'dweet') return obj === 'x' ? CONTEXT_2D : obj === 'c' ? CANVAS : null
  if (mode === 'three') return obj === 'THREE' ? loadThree() : obj === 'c' ? CANVAS : null
  return null
}

function globals(mode) {
  if (mode === 'dweet') return DWEET_GLOBALS
  if (mode === 'three') return THREE_GLOBALS
  if (mode === 'shadertoy') return GLSL
  if (mode === 'littlejs') return loadLittlejs()
  return null
}

// A result from options that may still be loading: synchronous whenever they're ready, so the
// list opens complete instead of changing under the cursor.
const resultAt = (from, options) => {
  const make = list => list ? { from, options: list, validFor: /^[\w$]*$/ } : null
  return options instanceof Promise ? options.then(make) : make(options)
}

// getMode() returns the concrete mode of the program being edited.
export function capjsCompletions(getMode) {
  return context => {
    const mode = getMode()
    if (mode === 'html') return htmlCompletionSource(context)
    if (mode === 'js') return jsGlobals ? jsGlobals(context) : null
    const dotted = context.matchBefore(/[\w$]+\.[\w$]*$/)
    if (dotted) {
      const dot = dotted.text.indexOf('.')
      return resultAt(dotted.from + dot + 1, members(mode, dotted.text.slice(0, dot)))
    }
    return resultAt(context.matchBefore(/[\w$]*$/).from, globals(mode))
  }
}
