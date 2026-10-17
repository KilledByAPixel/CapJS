// Runs dweet, three.js and Shadertoy programs on a canvas. Used by worker.js
// (OffscreenCanvas, globalScope = self) and frame.js (DOM canvas, globalScope = window).

import { wrapLoops } from '../code/loopProtect.js'
import { parseErrorLine } from '../code/errors.js'
import { errorInfo, makeReply } from './protocol.js'

// Shadertoy wrapper, ported from the legacy SetShader. The header spans 2 lines,
// so GLSL line N is editor line N - 2.
const SHADER_HEADER =
  '#version 300 es\n' +
  'precision highp float;' +
  'uniform vec3 iResolution;' +
  'uniform float iTime;' +
  'uniform float iTimeDelta;' +
  'uniform int iFrame;' +
  'uniform int iFrameRate;' +
  'uniform vec4 iMouse;' +
  'uniform sampler2D iChannel0;' +
  'out vec4 outColor;\n'
const SHADER_HEADER_LINES = 2
const SHADER_FOOTER = '\nvoid main(){mainImage(outColor,gl_FragCoord.xy);outColor.a=1.;}'
const VERTEX_SHADER = '#version 300 es\nin vec4 p;void main(){gl_Position=p;}'
const UNIFORMS = ['iResolution', 'iTime', 'iTimeDelta', 'iFrame', 'iFrameRate', 'iMouse', 'iChannel0']

const LOOP_CHECK_MASK = 1023 // check the clock every 1024 guard calls

export function createRuntime({ canvas, globalScope, now = () => performance.now() }) {
  // Own properties present at startup; anything added later is cleared on load.
  const baseline = new Set(Object.getOwnPropertyNames(globalScope))

  let mode = null, width = 0, height = 0, loopProtect = false
  let ctx = null, renderer = null, u = null, compileError = null
  let gl = null, program = null, texture = null, vertexBuffer = null, uniforms = {}
  let image = null, flippedImage = null, mouse = [0, 0, 0, 0]
  let deadline = Infinity, guardCalls = 0

  function loopGuard() {
    if ((++guardCalls & LOOP_CHECK_MASK) === 0 && now() > deadline) throw Error('Loop timed out')
  }

  const toError = e => errorInfo(e?.message ?? e, parseErrorLine(e?.stack))

  function clearUserGlobals() {
    for (const k of Object.getOwnPropertyNames(globalScope)) {
      if (!baseline.has(k)) try { delete globalScope[k] } catch { /* non-configurable */ }
    }
  }

  function installGlobals() {
    Object.assign(globalScope, {
      c: canvas,
      x: ctx,
      PI: Math.PI,
      S: Math.sin,
      C: Math.cos,
      T: Math.tan,
      R: (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`,
      DrawImage(img, X, Y, SX, SY, A) {
        ctx.save()
        ctx.translate(X, Y)
        ctx.rotate(A)
        ctx.drawImage(img, -SX / 2, -SY / 2, SX, SY)
        ctx.restore()
      },
      image,
      __lg: loopGuard,
    })
  }

  // Compiles a u(t) body. Never adds lines before the code (DWEET_LINE_OFFSET).
  function compile(code) {
    u = null
    compileError = null
    const body = loopProtect ? wrapLoops(code) : code
    try {
      u = new Function('t', body)
    } catch (e) {
      compileError = toError(e)
    }
    return compileError
  }

  // --- Shadertoy ---

  function compileShader(code) {
    if (program) gl.deleteProgram(program)
    program = null
    compileError = null
    const shader = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const vs = shader(gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = shader(gl.FRAGMENT_SHADER, SHADER_HEADER + code + SHADER_FOOTER)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(fs) || 'Shader compile failed'
      const m = /ERROR: 0:(\d+)/.exec(info)
      const line = m ? +m[1] - SHADER_HEADER_LINES : null
      compileError = errorInfo(info.trim(), line > 0 ? line : null)
    } else {
      const p = gl.createProgram()
      gl.attachShader(p, vs)
      gl.attachShader(p, fs)
      gl.bindAttribLocation(p, 0, 'p')
      gl.linkProgram(p)
      if (gl.getProgramParameter(p, gl.LINK_STATUS)) program = p
      else {
        compileError = errorInfo('LINK ERROR!\n' + gl.getProgramInfoLog(p))
        gl.deleteProgram(p)
      }
    }
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!program) return compileError

    gl.useProgram(program)
    uniforms = Object.fromEntries(UNIFORMS.map(n => [n, gl.getUniformLocation(program, n)]))
    // One giant triangle covering the screen, created once per context. The
    // attribute state is set again in case three.js used this context before.
    gl.bindVertexArray(null)
    if (!vertexBuffer) {
      vertexBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Int8Array([-3, 1, 1, -3, 1, 1]), gl.STATIC_DRAW)
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.BYTE, false, 0, 0)
    texture ??= gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    updateChannel0()
    return null
  }

  // WebGL ignores UNPACK_FLIP_Y_WEBGL for ImageBitmap sources, so flip up front.
  const flipImage = img => img ? createImageBitmap(img, { imageOrientation: 'flipY' }) : null

  // iChannel0 is the custom image, or the previous frame when none is loaded.
  function updateChannel0() {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    if (flippedImage) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, flippedImage)
    else gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, canvas.width, canvas.height, 0)
  }

  function drawShader(i) {
    if (!program) return
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform3f(uniforms.iResolution, canvas.width, canvas.height, 1)
    gl.uniform1f(uniforms.iTime, i / 60)
    gl.uniform1f(uniforms.iTimeDelta, 1 / 60)
    gl.uniform1i(uniforms.iFrame, i)
    gl.uniform1i(uniforms.iFrameRate, 60)
    gl.uniform1i(uniforms.iChannel0, 0)
    gl.uniform4f(uniforms.iMouse, ...mouse)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3)
    if (!flippedImage) updateChannel0()
  }

  // Dweets that change c.width keep the canvas aspect ratio, preserving pixels.
  function preserveAspect() {
    if (canvas.width === width || canvas.height !== height) return
    const copy = new OffscreenCanvas(canvas.width, canvas.height)
    copy.getContext('2d').drawImage(canvas, 0, 0)
    canvas.height = Math.round(canvas.width * height / width) & ~1
    ctx.drawImage(copy, 0, 0)
  }

  // --- Requests ---

  const handlers = {
    async load(msg) {
      clearUserGlobals()
      if (renderer) renderer.dispose()
      if (program) gl.deleteProgram(program)
      if (texture) gl.deleteTexture(texture)
      renderer = ctx = u = compileError = program = texture = null
      mouse = [0, 0, 0, 0]
      ;({ mode, width, height } = msg)
      loopProtect = !!msg.loopProtect
      deadline = Infinity
      canvas.width = width
      canvas.height = height

      if (mode === 'dweet') {
        ctx = canvas.getContext('2d')
        if (!ctx) throw Error('Could not create a 2D context on this canvas')
        installGlobals()
        return { error: compile(msg.code) }
      }
      if (mode === 'three') {
        const THREE = await import('three')
        renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true })
        renderer.setSize(width, height, false)
        if (msg.background) renderer.setClearColor(msg.background)
        ctx = renderer.getContext()
        installGlobals()
        Object.assign(globalScope, { THREE, renderer })
        return { error: compile(msg.code) }
      }
      if (mode === 'shadertoy') {
        gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
        if (!gl) throw Error('Could not create a WebGL2 context on this canvas')
        flippedImage = await flipImage(image)
        ctx = gl
        installGlobals()
        return { error: compileShader(msg.code) }
      }
      throw Error(`Mode ${mode} does not run on a canvas runtime`)
    },

    setCode(msg) {
      return { error: mode === 'shadertoy' ? compileShader(msg.code) : compile(msg.code) }
    },

    async frames(msg) {
      let error = compileError
      if (!error && mode) {
        deadline = now() + msg.budgetMs
        guardCalls = 0
        for (const i of msg.frames) {
          Object.assign(globalScope, { t: i / 60, time: i / 60, frame: i + 1 })
          try {
            if (mode === 'shadertoy') drawShader(i)
            else u?.(i / 60)
          } catch (e) {
            error = toError(e)
            break
          }
          if (mode === 'dweet') preserveAspect()
        }
        deadline = Infinity
      }
      return msg.grab ? { error, bitmap: await createImageBitmap(canvas) } : { error }
    },

    async grab() {
      return { bitmap: await createImageBitmap(canvas) }
    },

    async image(msg) {
      image = msg.bitmap ?? null
      globalScope.image = image
      if (mode === 'shadertoy') {
        flippedImage = await flipImage(image)
        if (program) updateChannel0()
      }
      return {}
    },

    mouse(msg) {
      mouse = [msg.x, msg.y, msg.z, msg.w]
      return {}
    },
  }

  // console.log is captured only while a request runs.
  async function run(msg) {
    const lines = []
    const con = globalScope.console
    const log = con.log
    con.log = (...args) => { lines.push(args.join(' ')) }
    let result
    try {
      const handler = handlers[msg.type]
      if (!handler) throw Error(`Unknown request type: ${msg.type}`)
      result = await handler(msg)
    } catch (e) {
      result = { error: toError(e) }
    } finally {
      con.log = log
    }
    return makeReply(msg.id, { ...result, console: lines.join('\n') })
  }

  // Requests run one at a time, in arrival order.
  let queue = Promise.resolve()
  return {
    handle(msg) {
      const reply = queue.then(() => run(msg))
      queue = reply
      return reply
    },
  }
}
