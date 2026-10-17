// tests/e2e/runner.spec.js
import { test, expect } from '@playwright/test'
const run = (page, fn, arg) => page.evaluate(fn, arg)
test.beforeEach(async ({ page }) => { await page.goto('./dev/runner-harness.html'); await page.waitForFunction(() => window.harness) })

for (const runMode of ['worker', 'page']) test(`dweet draws (${runMode})`, async ({ page }) => {
  const ink = await run(page, async (runMode) => {
    const r = harness.createRunner({ container: document.body, mode: 'dweet', runMode, width: 1920, height: 1080, background: '#fff' })
    await r.load('x.fillRect(0,0,960,1080)', { loopProtect: runMode === 'page' })
    await r.runFrames([0])
    return harness.sample(r)
  }, runMode)
  expect(ink).toBeGreaterThan(0.4)
})
test('worker infinite loop is killed fast and the page stays responsive', async ({ page }) => {
  const res = await run(page, async () => {
    const r = harness.createRunner({ container: document.body, mode: 'dweet', runMode: 'worker', width: 320, height: 180, background: null })
    await r.load('for(;;){}', { loopProtect: false })
    const t0 = performance.now(); const out = await r.runFrames([0]); const dt = performance.now() - t0
    const again = await r.runFrames([1])
    await r.load('x.fillRect(0,0,320,180)', { loopProtect: false }); const ok = await r.runFrames([0])
    return { timedOut: out.error?.timedOut, dt, deadAgain: again.error?.timedOut, recovered: ok.error === null }
  })
  expect(res).toMatchObject({ timedOut: true, deadAgain: true, recovered: true })
  expect(res.dt).toBeLessThan(1500)
})
test('page-mode infinite loop is caught by the loop buster', async ({ page }) => {
  const err = await run(page, async () => {
    const r = harness.createRunner({ container: document.body, mode: 'dweet', runMode: 'page', width: 320, height: 180, background: null })
    await r.load('c.style.filter="none";for(;;){}', { loopProtect: true })
    return (await r.runFrames([0], { budgetMs: 200 })).error.message
  })
  expect(err).toBe('Loop timed out')
})
for (const [mode, code] of [
  ['shadertoy', 'void mainImage(out vec4 c, in vec2 p){c=vec4(1,0,0,1);}'],
  ['three', 'if(!t){scene=new THREE.Scene();cam=new THREE.PerspectiveCamera(75,16/9);m=new THREE.Mesh(new THREE.PlaneGeometry(9,9),new THREE.MeshBasicMaterial({color:0xff0000}));m.position.z=-2;scene.add(m)}renderer.render(scene,cam)'],
]) test(`${mode} draws in a worker`, async ({ page }) => {
  const ink = await run(page, async ([mode, code]) => {
    const r = harness.createRunner({ container: document.body, mode, runMode: 'worker', width: 320, height: 180, background: null })
    const l = await r.load(code, { loopProtect: false }); if (l.error) return l.error.message
    await r.runFrames([0]); return harness.sample(r)
  }, [mode, code])
  expect(ink).toBeGreaterThan(0.5)
})
test('littlejs and html render in page mode; js reports console', async ({ page }) => {
  const res = await run(page, async () => {
    const mk = (mode) => harness.createRunner({ container: document.body, mode, runMode: 'page', width: 320, height: 180, background: null })
    const lj = mk('littlejs'); await lj.load('function gameRender(){drawRect(vec2(0,0),vec2(99,99),RED)}', { loopProtect: true })
    await new Promise(r => setTimeout(r, 500))
    const js = mk('js'); const jsOut = await js.load('console.log(1+1)', { loopProtect: true })
    const html = mk('html'); const htmlOut = await html.load('<h1>hi</h1>', { loopProtect: false })
    return { lj: await harness.sample(lj), js: jsOut.console, html: htmlOut.error }
  })
  expect(res.lj).toBeGreaterThan(0.3)
  expect(res.js).toBe('2')
  expect(res.html).toBeNull()
})

// --- Added beyond the brief: gaps Task 6 left untested, and runner-specific behavior ---

test('html top-level error is reported through onAsyncError with its line', async ({ page }) => {
  const err = await run(page, async () => {
    const r = harness.createRunner({ container: document.body, mode: 'html', runMode: 'page', width: 320, height: 180, background: null })
    const got = new Promise(res => r.onAsyncError(res))
    const out = await r.load('<body>\n<h1>hi</h1>\n<script>\nnope()\n</script>', { loopProtect: false })
    return { load: out.error, async: await got }
  })
  expect(err).toEqual({ load: null, async: { message: 'nope is not defined', line: 4 } })
})

test('littlejs grab is non-blank, from grab() and from runFrames', async ({ page }) => {
  const res = await run(page, async () => {
    const r = harness.createRunner({ container: document.body, mode: 'littlejs', runMode: 'page', width: 320, height: 180, background: null })
    await r.load('function gameRender(){drawRect(vec2(0,0),vec2(99,99),RED)}', { loopProtect: true })
    await new Promise(res => setTimeout(res, 500))
    const grabbed = await r.grab()
    const framed = (await r.runFrames([0], { grab: true })).bitmap
    return { grab: await harness.inkFraction(grabbed), frames: await harness.inkFraction(framed) }
  })
  expect(res.grab).toBeGreaterThan(0.9)
  expect(res.frames).toBeGreaterThan(0.9)
})

test('the custom image survives a reload of a fresh worker', async ({ page }) => {
  const ink = await run(page, async () => {
    const r = harness.createRunner({ container: document.body, mode: 'dweet', runMode: 'worker', width: 320, height: 180, background: null })
    await r.setImage(await createImageBitmap(new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1)))
    await r.load('x.drawImage(image,0,0,c.width,c.height)', { loopProtect: false })
    await r.load('x.drawImage(image,0,0,c.width,c.height)', { loopProtect: false })
    const out = await r.runFrames([0], { grab: true })
    return out.error ?? harness.inkFraction(out.bitmap)
  })
  expect(ink).toBe(1)
})

test('mouse drags drive the Shadertoy iMouse in a worker', async ({ page }) => {
  await run(page, async () => {
    document.body.style.cssText = 'margin:0;width:320px;height:180px'
    window.r = harness.createRunner({ container: document.body, mode: 'shadertoy', runMode: 'worker', width: 320, height: 180, background: null })
    // Red only where the shader sees the button down near the click point (canvas pixels, y up).
    await r.load('void mainImage(out vec4 c, in vec2 p){c=iMouse.z>0.&&abs(iMouse.z-80.)<2.&&abs(iMouse.w-135.)<2.&&abs(iMouse.x-240.)<2.?vec4(1,0,0,1):vec4(1);}', { loopProtect: false })
  })
  await page.mouse.move(80, 45)
  await page.mouse.down()
  await page.mouse.move(240, 45)
  const down = await run(page, async () => { await r.runFrames([0]); return harness.sample(r) })
  await page.mouse.up()
  const up = await run(page, async () => { await r.runFrames([1]); return harness.sample(r) })
  expect(down).toBe(1)
  expect(up).toBe(0)
})

test('a destroyed runner answers immediately and leaves no element behind', async ({ page }) => {
  const res = await run(page, async () => {
    const r = harness.createRunner({ container: document.body, mode: 'dweet', runMode: 'worker', width: 320, height: 180, background: null })
    await r.load('x.fillRect(0,0,9,9)', { loopProtect: false })
    r.destroy()
    return { error: (await r.runFrames([0])).error?.message, attached: document.body.contains(r.element) }
  })
  expect(res).toEqual({ error: 'Runner destroyed', attached: false })
})
