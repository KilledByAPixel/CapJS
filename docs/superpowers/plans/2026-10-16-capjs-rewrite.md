# CapJS Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-file 2019 CapJS with a modular, Vite-built live code editor. It adds an in-app IndexedDB library (versions, forks, templates, thumbnails, export/import), freeze-proof worker execution, and GIFs with one global palette and dithering.

**Architecture:** One app page (`index.html`) holds the UI and talks to a **runner**. The runner executes user code either in a Web Worker drawing to an `OffscreenCanvas` (default; killed by a watchdog if a frame hangs) or in a same-origin iframe (`frame.html`) for DOM-using code, HTML, plain JS and LittleJS. Both sides speak one message protocol and share one runtime module. The library is a thin IndexedDB layer with pure merge logic for backups. Capture drives the runner deterministically, frame by frame, then encodes in a worker.

**Tech Stack:** Vite 8.3.4, CodeMirror 6 (`codemirror` 6.0.2, `@codemirror/lang-javascript` 6.2.5, `@codemirror/lang-html` 6.4.12, `@codemirror/lang-cpp` 6.0.3, `@codemirror/theme-one-dark` 6.1.3), `three` 0.186.1, `littlejsengine` 1.27.2, `gifenc` 1.0.3, `webm-muxer` 5.1.4. Tests: Vitest 5.0.5, `fake-indexeddb` 6.2.6, `@playwright/test` 1.64.1 (Chromium). Plain JavaScript ES modules, no TypeScript. Node 22.

**Spec:** `docs/superpowers/specs/2026-10-16-capjs-rewrite-design.md`

## Global Constraints

- Served from GitHub Pages at a project path. Vite `base` is `'/CapJS/'`, defined once in `vite.config.js`.
- No backend. All persistent data is in IndexedDB database `capjs` plus localStorage key `capjs.settings`.
- Desktop Chrome is the target. No mobile work.
- Modes: `auto`, `dweet`, `js`, `html`, `three`, `shadertoy`, `littlejs`. No GLSL mode.
- Run modes: `auto`, `worker`, `page`. `html`, `js` and `littlejs` always resolve to `page`.
- Program time is fixed-step at 60 steps per second. Step index `i` calls `u(i/60)` with global `frame = i+1` and `time = i/60`.
- Default canvas is 1920×1080. Background is enabled by default, color `#ffffff`.
- Default capture settings: GIF, 960×540, 2 s, 60 fps, dither `fs`, speed 1, aspect `fill`.
- GIF size warning threshold: 15,000,000 bytes.
- The custom image is app-level state (IndexedDB `kv` key `lastImage`). It is never stored in a creation or version.
- Editor font sizes are `1.0, 1.5, 2.0, 2.5, 3.0` em, labeled XS, S, M, L, XL. Default is 2.0. Default theme is `capjs`.
- Keyboard shortcuts: Alt+Up pause/resume, Alt+Down and Alt+Enter restart, Alt+Right single-step, Ctrl+S save, Ctrl+Space word completion, Ctrl+F search.
- Cut entirely: watch window, beautifier, GLSL mode, PNG/JPG sequence capture, CCapture.
- All work happens on branch `rewrite`. The old app is moved to `legacy/` in Task 1 and deleted in Task 13.

## Review Focus

1. **IndexedDB unavailable or blocked** (private window, storage disabled). The editor and runner still work, and a visible "Library unavailable" banner appears instead of a crash. Test is in Task 10.
2. **A capture too big for memory** (for example 1920×1080 at 60 fps for 20 s is about 20 GB of raw frames). Capture refuses up front with a message, instead of crashing the tab. Test is in Task 11.
3. **Importing a non-CapJS or corrupted JSON file.** It shows a clear error and the library is untouched. Test is in Task 5.
4. **Reload with a page-mode infinite loop saved as the draft.** The app boots to a "Click to run" state instead of freezing. Test is in Task 9.
5. **Typing in the editor while a capture is running.** The capture finishes with the code it started with and the right frame count, and live re-runs are suspended until it's done. Test is in Task 11.

---

## File Structure

```
index.html                      app shell markup (top bar, sidebar, columns, panels)
frame.html                      blank page that hosts the page-mode runtime
vite.config.js                  base, multi-page inputs, worker format
vitest.config.js / playwright.config.js
.github/workflows/deploy.yml    build + publish to GitHub Pages
dev/runner-harness.html         dev-only page exposing runners to e2e tests (not built)
src/main.js                     boot: settings, library, editor, runner, UI wiring
src/app/settings.js             app-level settings in localStorage
src/app/clock.js                fixed-step clock (play, pause, step, seek, speed)
src/app/session.js              current creation + draft + runner lifecycle, on-change debounce
src/code/dwitter.js             compress, uncompress, minify, countChars, countBytes
src/code/detect.js              detectMode, needsFullPage, resolveRunMode
src/code/loopProtect.js         wrapLoops (page-mode loop buster)
src/code/errors.js              parseErrorLine
src/code/share.js               buildShareUrl, parseShareUrl
src/vendor/jsoncrush.js         JSONCrush/JSONUncrush (copied from old index.html, exported)
src/library/db.js               IndexedDB open + tiny promise helpers
src/library/library.js          creation/version/draft/delete operations
src/library/backup.js           exportLibrary, importLibrary (merge)
src/library/textImport.js       bulk .txt → creations
src/library/templates.js        built-in templates
src/library/thumbnail.js        makeThumbnail
src/runner/protocol.js          message type constants
src/runner/runtime.js           shared runtime: dweet / three / shadertoy execution
src/runner/worker.js            worker entry: runtime over postMessage
src/runner/frame.js             frame.html entry: runtime + html/js/littlejs over postMessage
src/runner/runner.js            createRunner (main side), watchdog, page/worker selection
src/capture/aspect.js           computeDrawRect, composeFrame
src/capture/schedule.js         captureTargets, gifDelays, estimateCaptureBytes
src/capture/gifEncode.js        buildGlobalPalette, mapFrame, markUnchanged, encodeGif
src/capture/gifWorker.js        worker wrapper around encodeGif
src/capture/webm.js             encodeWebm
src/capture/capture.js          runCapture (drives runner, collects frames, encodes)
src/ui/editor.js                CodeMirror 6 setup, themes, keymaps, paste-uncompress
src/ui/themes.js                capjs theme port + others
src/ui/layout.css               all styles
src/ui/topbar.js  src/ui/transport.js  src/ui/canvasPanel.js  src/ui/capturePanel.js
src/ui/statusBar.js  src/ui/errorBar.js  src/ui/sidebar.js  src/ui/gallery.js
src/ui/history.js  src/ui/gifPreview.js  src/ui/help.js  src/ui/download.js
tests/unit/*.test.js            Vitest
tests/e2e/*.spec.js             Playwright
tests/helpers/gifParse.js       minimal GIF structure walker for assertions
```

---

### Task 1: Project scaffold, test rigs, deploy workflow

**Files:**
- Move: `index.html`, `codemirror/`, `build/`, `miniBeautifer/`, `CCapture.all.min.js`, `gif.worker.js`, `three.min.js` → `legacy/` (`git mv`)
- Keep: `favicon.png` → `public/favicon.png`
- Create: `package.json`, `vite.config.js`, `vitest.config.js`, `playwright.config.js`, `index.html`, `frame.html`, `src/main.js`, `src/ui/layout.css`, `.github/workflows/deploy.yml`, `README.md`, `tests/unit/smoke.test.js`, `tests/e2e/smoke.spec.js`
- Modify: `.gitignore` (add `node_modules/`, `dist/`, `test-results/`, `playwright-report/`)

**Interfaces:**
- Produces: npm scripts `dev` (vite), `build` (vite build), `preview`, `test` (vitest run), `e2e` (playwright test). Playwright `baseURL` is `http://localhost:5179/CapJS/`, and the web server is `vite --port 5179 --strictPort`.

- [ ] **Step 1: Create branch and move legacy files**

```bash
git checkout -b rewrite
mkdir legacy public
git mv index.html codemirror build miniBeautifer CCapture.all.min.js gif.worker.js three.min.js legacy/
git mv favicon.png public/favicon.png
```

- [ ] **Step 2: Create `package.json` with pinned versions from the Tech Stack line** (`"type": "module"`, scripts as above). Run `npm install` and `npx playwright install chromium`.

- [ ] **Step 3: Create `vite.config.js`**

`base: '/CapJS/'`, `build.rollupOptions.input = { main: 'index.html', frame: 'frame.html' }`, `worker.format = 'es'`. `dev/` is not an input.

- [ ] **Step 4: Write smoke tests**

```js
// tests/unit/smoke.test.js
import { test, expect } from 'vitest'
test('vitest runs', () => expect(1 + 1).toBe(2))
```

```js
// tests/e2e/smoke.spec.js
import { test, expect } from '@playwright/test'
test('app shell loads', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('CapJS')
  await expect(page.locator('#app')).toBeVisible()
})
```

- [ ] **Step 5: Run both and confirm the e2e test fails** (`npm test` passes; `npm run e2e` fails because there's no `#app`).

- [ ] **Step 6: Create a minimal `index.html`** (`<title>CapJS</title>`, `<div id="app">`, module script `src/main.js`, favicon) and `frame.html` (blank body, module script `src/runner/frame.js`, which is an empty file for now). `src/main.js` imports `./ui/layout.css`.

- [ ] **Step 7: Create `.github/workflows/deploy.yml`.** On push to `main` and `workflow_dispatch`: `actions/checkout@v4`, `actions/setup-node@v4` (node 22, cache npm), `npm ci`, `npm run build`, `actions/upload-pages-artifact@v3` (path `dist`), `actions/deploy-pages@v4`. Permissions `pages: write`, `id-token: write`. Environment `github-pages`.

- [ ] **Step 8: Write `README.md`.** Cover what CapJS is, `npm install`, `npm run dev`, `npm test`, `npm run e2e`, and one-time GitHub Pages setup: create a repo named `CapJS`, push, then Settings → Pages → Source: "GitHub Actions". Note that the `base` in `vite.config.js` must match the repo name or a custom domain.

- [ ] **Step 9: Run `npm test`, `npm run e2e` and `npm run build`.** All pass, and `dist/index.html` and `dist/frame.html` exist.

- [ ] **Step 10: Commit** — `chore: scaffold Vite rewrite, move old app to legacy/`

---

### Task 2: Dwitter code utilities and share links

**Files:**
- Create: `src/code/dwitter.js`, `src/code/share.js`, `src/vendor/jsoncrush.js`
- Test: `tests/unit/dwitter.test.js`, `tests/unit/share.test.js`

**Interfaces:**
- Produces:
  - `compress(code: string) → string`
  - `uncompress(code: string) → string`
  - `isCompressed(code: string) → boolean`
  - `minify(code: string) → string`
  - `countChars(code: string) → number` (code points)
  - `countBytes(code: string) → number` (UTF-8)
  - `buildShareUrl(baseHref: string, {name: string, mode: string, code: string}) → string`
  - `parseShareUrl(href: string) → {name: string|null, mode: string|null, code: string} | null`
  - `JSONCrush`, `JSONUncrush` named exports

- [ ] **Step 1: Write failing tests**

```js
// tests/unit/dwitter.test.js
import { test, expect } from 'vitest'
import { compress, uncompress, isCompressed, minify, countChars, countBytes } from '../../src/code/dwitter.js'
const prog = 'c.width|=0\nfor(i=1e3;i--;)\nx.fillRect(960+900*S(i*2),540+500*C(t*PI/2+i*3),29,29)'

test('compress round-trips (odd length is padded with ;)', () => {
  const c = compress(prog)
  expect(c.startsWith('eval(unescape(escape`')).toBe(true)
  expect(countChars(c)).toBe(84)
  expect(uncompress(c)).toBe(prog + ';')
  expect(uncompress(compress('ab;c'))).toBe('ab;c')
  expect(uncompress(compress('abc'))).toBe('abc;')
})
test('compress escapes characters above 255 as \\uXXXX', () => {
  expect(uncompress(compress('s="█"'))).toBe('s="\\u2588"')
})
test('uncompress keeps text before and after, passes plain code through', () => {
  expect(uncompress('// hi\n' + compress('ab'))).toBe('// hi\nab')
  expect(uncompress(compress('ab') + '\n//x')).toBe('ab\n//x')
  expect(uncompress('x.fillRect(0,0,9,9)')).toBe('x.fillRect(0,0,9,9)')
  expect(isCompressed(compress('ab'))).toBe(true)
  expect(isCompressed('ab')).toBe(false)
})
test('minify is conservative: trims lines, drops blank lines and whole-line // comments', () => {
  expect(minify('  a = 1\n\n  // note\n  s = "a  b" // keep\n')).toBe('a = 1\ns = "a  b" // keep')
})
test('counts', () => {
  expect(countChars('a█')).toBe(2)
  expect(countBytes('a█')).toBe(4)
})
```

```js
// tests/unit/share.test.js
import { test, expect } from 'vitest'
import { buildShareUrl, parseShareUrl } from '../../src/code/share.js'
test('share URL round trip', () => {
  const url = buildShareUrl('https://x.github.io/CapJS/', { name: 'spiral', mode: 'dweet', code: 'x.fillRect(0,0,9,9)' })
  expect(parseShareUrl(url)).toEqual({ name: 'spiral', mode: 'dweet', code: 'x.fillRect(0,0,9,9)' })
})
test('auto mode is omitted, old ?code= links load, no params → null', () => {
  expect(new URL(buildShareUrl('https://a/', { name: 'n', mode: 'auto', code: 'a' })).searchParams.has('mode')).toBe(false)
  expect(parseShareUrl('https://a/?code=abc').code).toBe('abc')
  expect(parseShareUrl('https://a/')).toBeNull()
})
```

- [ ] **Step 2: Run `npx vitest run tests/unit/dwitter.test.js tests/unit/share.test.js`.** Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `src/code/dwitter.js`**

`compress` ports the old `DwitterCompress`: trim, escape code points >255 to `\uXXXX`, pad with `;` to even length, pack pairs into `0xDB00|a`, `0xDF00|b`, and wrap as `` eval(unescape(escape`…`.replace(/u../g,''))) ``.

`uncompress` must **not** use `eval`. Find the first match of ``/eval\(unescape\(escape`([^`]*)`\.replace\(\/u\.\.\/g,(''|"")\)\)\)/``. The decoded text is `[...match[1]].map(unit => String.fromCharCode(unit.charCodeAt(0) & 0xFF))`, iterating UTF-16 code units, not code points. Return `before + decoded + after`.

`minify`: split lines, trim each, drop empty lines and lines starting with `//`, join with `\n`.

`countBytes` uses `new TextEncoder().encode(s).length`.

- [ ] **Step 4: Implement `src/vendor/jsoncrush.js`.** Copy `JSONCrush`, `JSONUncrush`, `JSONCrushSwap` verbatim from `legacy/index.html` line 1759 and export the first two.

Implement `src/code/share.js` using the params `filename`, `mode` (omitted when `auto`) and `crushed`. `parseShareUrl` also accepts legacy `code`.

- [ ] **Step 5: Run the tests.** Expected: PASS.

- [ ] **Step 6: Commit** — `feat: dwitter compress/uncompress/minify and share links`

---

### Task 3: Mode detection, loop buster, error line mapping

**Files:**
- Create: `src/code/detect.js`, `src/code/loopProtect.js`, `src/code/errors.js`
- Test: `tests/unit/detect.test.js`, `tests/unit/loopProtect.test.js`, `tests/unit/errors.test.js`

**Interfaces:**
- Produces:
  - `detectMode(code: string) → 'dweet'|'html'|'three'|'shadertoy'|'littlejs'` (never `js`)
  - `effectiveMode(selected: string, code: string) → concrete mode` (`auto` → `detectMode`)
  - `needsFullPage(code: string) → boolean`
  - `resolveRunMode(mode: concrete, runModeSetting: 'auto'|'worker'|'page', code) → 'worker'|'page'`
  - `wrapLoops(code: string, guard = '__lg()') → string`
  - `DWEET_LINE_OFFSET = 2`
  - `parseErrorLine(stack: string, offset = DWEET_LINE_OFFSET) → number|null` (1-based editor line)

- [ ] **Step 1: Write failing tests**

```js
// tests/unit/detect.test.js
import { test, expect } from 'vitest'
import { detectMode, effectiveMode, needsFullPage, resolveRunMode } from '../../src/code/detect.js'
test('detectMode', () => {
  expect(detectMode('x.fillRect(0,0,9,9)')).toBe('dweet')
  expect(detectMode('scene=new THREE.Scene()')).toBe('three')
  expect(detectMode('void mainImage(out vec4 c, in vec2 p){}')).toBe('shadertoy')
  expect(detectMode('  <div>hi</div>')).toBe('html')
  expect(detectMode('function gameInit(){}\nnew EngineObject(vec2(0,0))')).toBe('littlejs')
  expect(effectiveMode('js', 'THREE')).toBe('js')
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
```

```js
// tests/unit/loopProtect.test.js
import { test, expect } from 'vitest'
import { wrapLoops } from '../../src/code/loopProtect.js'
const run = (code, limit) => { let n = 0; const __lg = () => { if (++n > limit) throw Error('Loop timed out') }; return new Function('__lg', code)(__lg) }
test('infinite loops of each kind throw', () => {
  for (const code of ['for(;;){}', 'for(i=0;i<9;i--);', 'while(1)x=1', 'do{}while(true)', 'for(i=0;;)i++'])
    expect(() => run(wrapLoops(code), 1e5), code).toThrow('Loop timed out')
})
test('finite loops still compute the same result', () => {
  expect(run(wrapLoops('let s=0;for(let i=0;i<10;i++)s+=i;return s'), 1e5)).toBe(45)
  expect(run(wrapLoops('let s=0,i=5;while(i--)s++;return s'), 1e5)).toBe(5)
})
test('for-of / for-in are left alone', () => {
  expect(wrapLoops('for(const a of b);for(k in o);')).toBe('for(const a of b);for(k in o);')
})
```

```js
// tests/unit/errors.test.js
import { test, expect } from 'vitest'
import { parseErrorLine } from '../../src/code/errors.js'
test('maps a runtime error in new Function code to the editor line', () => {
  let stack
  try { new Function('t', 'a=1\nb=2\nnope()')(0) } catch (e) { stack = e.stack }
  expect(parseErrorLine(stack)).toBe(3)
  expect(parseErrorLine('Error: x\n    at foo (app.js:10:2)')).toBeNull()
})
```

- [ ] **Step 2: Run the three test files.** Expected: FAIL.

- [ ] **Step 3: Implement `detect.js`.** Check in this order: `THREE` → three; `/void\s+mainImage/` → shadertoy; trimmed starts with `<` → html; `/\b(engineInit|gameInit|gameUpdate|gameRender|EngineObject|drawTile)\b/` → littlejs; otherwise dweet.

`needsFullPage` uses `/\bdocument\b|\.style\b|\bwindow\b|\bbody\b|\balert\s*\(|\bnew\s+Image\b|\bAudio(Context)?\b|\bspeechSynthesis\b|\baddEventListener\b|\bon(click|mouse\w*|key\w*|pointer\w*)\s*=/`.

- [ ] **Step 4: Implement `wrapLoops`.** Use the old regex approach from `legacy/index.html:810-818`: for `for(init;cond;` insert `guard,` before the increment (or just `guard` when the increment is empty), and for `while(` insert `guard,` before the condition. Skip `for` heads containing ` of ` or ` in `. Insert inline only and never add newlines, so line numbers stay intact.

- [ ] **Step 5: Implement `parseErrorLine`.** Take the first `/<anonymous>:(\d+):\d+/` match, then line − offset. Return null if there's no match or the result is < 1.

- [ ] **Step 6: Run the tests.** Expected: PASS.

- [ ] **Step 7: Commit** — `feat: mode detection, loop buster, error line mapping`

---

### Task 4: Library storage (IndexedDB)

**Files:**
- Create: `src/library/db.js`, `src/library/library.js`
- Test: `tests/unit/library.test.js` (starts with `import 'fake-indexeddb/auto'`; each test opens a unique `dbName`)

**Interfaces:**
- Produces:
  - Type `Settings = {canvasWidth:number, canvasHeight:number, background:{enabled:boolean, color:string}}`
  - Constant `DEFAULT_CREATION_SETTINGS = {canvasWidth:1920, canvasHeight:1080, background:{enabled:true, color:'#ffffff'}}`
  - Type `Creation = {id, name, mode, runMode, settings, parentId:string|null, parentVersionId:string|null, createdAt, updatedAt, headVersionId, versionCount, thumbnail:Blob|null, deletedAt:number|null}`
  - Type `Version = {id, creationId, n, code, mode, runMode, settings, createdAt}`
  - Type `Draft = {creationId, code, mode, runMode, settings, updatedAt}`
  - `openLibrary({dbName = 'capjs', now = Date.now} = {}) → Promise<Library>`
  - `Library` methods, all async:
    - `listCreations({includeDeleted = false})` → `Creation[]`, `updatedAt` descending
    - `getCreation(id)`
    - `createCreation({name, mode, runMode = 'auto', settings = DEFAULT_CREATION_SETTINGS, code, parentId = null, parentVersionId = null})` → `Creation` with version 1
    - `saveVersion(creationId, {code, mode, runMode, settings, thumbnail})` → `Version`
    - `listVersions(creationId)` → `Version[]`, `n` descending
    - `getVersion(id)`
    - `fork(creationId, versionId = head)` → `Creation`
    - `rename(id, name)`
    - `setDraft(creationId, {code, mode, runMode, settings})`, `getDraft(creationId)` → `Draft|null`, `discardDraft(creationId)`
    - `deleteCreation(id)`, `restoreCreation(id)`, `purgeCreation(id)`
    - `listTombstones()` → `{id, deletedAt}[]`
    - `getKV(key)`, `setKV(key, value)`
    - `raw` (the low-level helpers from `db.js`, used by backup)
  - Object stores: `creations` (key `id`), `versions` (key `id`, index `creationId`), `drafts` (key `creationId`), `tombstones` (key `id`), `kv` (key `key`).

- [ ] **Step 1: Write failing tests**

```js
import 'fake-indexeddb/auto'
import { test, expect } from 'vitest'
import { openLibrary } from '../../src/library/library.js'
let n = 0, clock = 1000
const open = () => openLibrary({ dbName: 'lib' + n++, now: () => clock++ })
const base = { name: 'spiral', mode: 'dweet', code: 'a' }

test('create makes v1; save appends versions, updates head and clears draft', async () => {
  const lib = await open()
  const c = await lib.createCreation(base)
  expect(c.versionCount).toBe(1)
  await lib.setDraft(c.id, { code: 'b', mode: 'dweet', runMode: 'auto', settings: c.settings })
  const v2 = await lib.saveVersion(c.id, { code: 'b', mode: 'dweet', runMode: 'auto', settings: c.settings, thumbnail: null })
  expect(v2.n).toBe(2)
  expect((await lib.getCreation(c.id)).headVersionId).toBe(v2.id)
  expect(await lib.getDraft(c.id)).toBeNull()
  expect((await lib.listVersions(c.id)).map(v => v.code)).toEqual(['b', 'a'])
  expect(await lib.getKV('savesSinceExport')).toBe(1)
})
test('fork copies the chosen version and records its parent', async () => {
  const lib = await open()
  const c = await lib.createCreation(base)
  const [v1] = await lib.listVersions(c.id)
  await lib.saveVersion(c.id, { ...base, runMode: 'auto', settings: c.settings, code: 'z', thumbnail: null })
  const f = await lib.fork(c.id, v1.id)
  expect(f.name).toBe('spiral fork')
  expect(f.parentId).toBe(c.id)
  expect(f.parentVersionId).toBe(v1.id)
  expect((await lib.listVersions(f.id))[0].code).toBe('a')
})
test('drafts are per creation', async () => {
  const lib = await open()
  const a = await lib.createCreation(base), b = await lib.createCreation({ ...base, name: 'b' })
  await lib.setDraft(a.id, { code: 'A*', mode: 'dweet', runMode: 'auto', settings: a.settings })
  expect((await lib.getDraft(a.id)).code).toBe('A*')
  expect(await lib.getDraft(b.id)).toBeNull()
})
test('delete hides, restore returns, purge leaves a tombstone', async () => {
  const lib = await open()
  const c = await lib.createCreation(base)
  await lib.deleteCreation(c.id)
  expect(await lib.listCreations()).toHaveLength(0)
  expect(await lib.listCreations({ includeDeleted: true })).toHaveLength(1)
  await lib.restoreCreation(c.id)
  expect(await lib.listCreations()).toHaveLength(1)
  await lib.deleteCreation(c.id); await lib.purgeCreation(c.id)
  expect(await lib.getCreation(c.id)).toBeNull()
  expect(await lib.listVersions(c.id)).toHaveLength(0)
  expect((await lib.listTombstones()).map(t => t.id)).toEqual([c.id])
})
```

- [ ] **Step 2: Run the test file.** Expected: FAIL.

- [ ] **Step 3: Implement `db.js`** (`openDb(name)` with version-1 upgrade creating the stores above, plus `get/put/del/getAll/getAllByIndex` promise helpers) **and `library.js`**. IDs come from `crypto.randomUUID()`. `listTombstones` returns soft-deleted creations (`{id, deletedAt}`) plus purged entries from the `tombstones` store. `saveVersion` increments `kv.savesSinceExport`. The first `saveVersion` per session calls `navigator.storage?.persist?.()`, guarded.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit** — `feat: IndexedDB library with versions, forks, drafts, soft delete`

---

### Task 5: Backup export/import, bulk text import, templates

**Files:**
- Create: `src/library/backup.js`, `src/library/textImport.js`, `src/library/templates.js`
- Test: `tests/unit/backup.test.js`, `tests/unit/textImport.test.js`

**Interfaces:**
- Consumes: `Library` (Task 4), `detectMode` (Task 3)
- Produces:
  - `exportLibrary(lib) → Promise<BackupFile>`, where `BackupFile = {format:'capjs-library', version:1, exportedAt:number, creations:(Creation with thumbnail:string|null data URL)[], versions:Version[], tombstones:{id, deletedAt}[]}`. Soft-deleted creations appear only as tombstones. Sets kv `lastExportAt = now`, `savesSinceExport = 0`.
  - `importLibrary(lib, data: unknown) → Promise<{addedCreations:number, addedVersions:number, skipped:number}>`. Throws `Error('Not a CapJS library file')` before any write if `data.format !== 'capjs-library'`, or if `creations`/`versions` aren't arrays.
  - `backupFileName(now: number) → 'capjs-library-YYYY-MM-DD.json'` (local date)
  - `importTextFiles(lib, files: {name:string, text:string}[]) → Promise<Creation[]>`: name is the filename without extension, `mode: 'auto'`
  - `TEMPLATES: {id, name, mode, code}[]` with ids `dweet`, `dweet-image`, `js`, `html`, `three`, `shadertoy`, `littlejs`

- [ ] **Step 1: Write failing tests**

```js
// tests/unit/backup.test.js
import 'fake-indexeddb/auto'
import { test, expect } from 'vitest'
import { openLibrary } from '../../src/library/library.js'
import { exportLibrary, importLibrary, backupFileName } from '../../src/library/backup.js'
let n = 0, clock = 1000
const open = () => openLibrary({ dbName: 'bk' + n++, now: () => clock++ })
const base = { name: 's', mode: 'dweet', code: 'a' }
const save = (lib, c, code) => lib.saveVersion(c.id, { code, mode: 'dweet', runMode: 'auto', settings: c.settings, thumbnail: null })

test('export → import into an empty library recreates everything; re-import is a no-op', async () => {
  const a = await open(); const c = await a.createCreation(base); await save(a, c, 'b')
  const file = JSON.parse(JSON.stringify(await exportLibrary(a)))
  const b = await open()
  expect(await importLibrary(b, file)).toEqual({ addedCreations: 1, addedVersions: 2, skipped: 0 })
  expect(await importLibrary(b, file)).toEqual({ addedCreations: 0, addedVersions: 0, skipped: 1 })
  expect((await b.listVersions(c.id)).map(v => [v.n, v.code])).toEqual([[2, 'b'], [1, 'a']])
})
test('merge adds newer versions from the backup and moves head', async () => {
  const a = await open(); const c = await a.createCreation(base)
  const b = await open(); await importLibrary(b, await exportLibrary(a))
  const v = await save(a, c, 'newer')
  expect((await importLibrary(b, await exportLibrary(a))).addedVersions).toBe(1)
  expect((await b.getCreation(c.id)).headVersionId).toBe(v.id)
})
test('deleted creations never come back from an older backup', async () => {
  const a = await open(); const c = await a.createCreation(base)
  const old = await exportLibrary(a)
  await a.deleteCreation(c.id)
  expect((await importLibrary(a, old)).addedCreations).toBe(0)
  expect(await a.listCreations()).toHaveLength(0)
  expect((await exportLibrary(a)).tombstones.map(t => t.id)).toEqual([c.id])
})
test('garbage input throws and writes nothing', async () => {
  const a = await open()
  for (const bad of [null, {}, { format: 'other' }, { format: 'capjs-library', creations: 'x', versions: [] }])
    await expect(importLibrary(a, bad)).rejects.toThrow('Not a CapJS library file')
  expect(await a.listCreations({ includeDeleted: true })).toHaveLength(0)
})
test('export resets backup counters; file name', async () => {
  const a = await open(); const c = await a.createCreation(base); await save(a, c, 'b')
  await exportLibrary(a)
  expect(await a.getKV('savesSinceExport')).toBe(0)
  expect(backupFileName(new Date(2026, 9, 16, 12).getTime())).toBe('capjs-library-2026-10-16.json')
})
```

```js
// tests/unit/textImport.test.js
import 'fake-indexeddb/auto'
import { test, expect } from 'vitest'
import { openLibrary } from '../../src/library/library.js'
import { importTextFiles } from '../../src/library/textImport.js'
import { TEMPLATES } from '../../src/library/templates.js'
test('each text file becomes a creation named after the file', async () => {
  const lib = await openLibrary({ dbName: 'txt' })
  const made = await importTextFiles(lib, [{ name: 'spiral v3.txt', text: 'x.fillRect(0,0,9,9)' }, { name: 'sky.js', text: 'a' }])
  expect(made.map(c => c.name)).toEqual(['spiral v3', 'sky'])
  expect(made[0].mode).toBe('auto')
})
test('templates cover every mode except auto', () => {
  expect(TEMPLATES.map(t => t.id)).toEqual(['dweet', 'dweet-image', 'js', 'html', 'three', 'shadertoy', 'littlejs'])
})
```

- [ ] **Step 2: Run both files.** Expected: FAIL.

- [ ] **Step 3: Implement `backup.js`.** Merge rules:
  - Validate first.
  - Incoming tombstone for an id that doesn't exist locally → write it to the `tombstones` store. Never delete a live local creation.
  - Incoming creation whose id is tombstoned or soft-deleted locally → skip it and its versions.
  - Unknown creation → add it and all its versions.
  - Known creation → add versions whose id is missing. Then renumber `n` 1..k by `createdAt` ascending, set `headVersionId` to the latest version, `versionCount = k`, `updatedAt = max`. Take the thumbnail from the incoming creation if its `updatedAt` is newer.
  - A creation counts as `skipped` when nothing was added for it.

Thumbnails go Blob → data URL on export and back on import, using `FileReader`/`fetch(dataURL).blob()`. Both exist in Node 22 and fake-indexeddb tests.

- [ ] **Step 4: Implement `templates.js`.** `dweet` uses the old default program. `dweet-image` draws `image` when loaded. `three` and `shadertoy` use the old help examples (`legacy/index.html:357-385`). `html` is a minimal page. `js` uses `console.log`. `littlejs` is a short with `gameInit` creating an object and `gameRender` drawing a rect. Every template starts with a short comment line explaining what it is.

Implement `textImport.js`.

- [ ] **Step 5: Run the tests.** Expected: PASS.

- [ ] **Step 6: Commit** — `feat: library backup merge, bulk text import, templates`

---

### Task 6: Shared runtime, worker and frame entries

**Files:**
- Create: `src/runner/protocol.js`, `src/runner/runtime.js`, `src/runner/worker.js`, `src/runner/frame.js`
- Test: `tests/unit/runtime.test.js` (dweet path only, with a stub 2D context)

**Interfaces:**
- Consumes: `wrapLoops`, `parseErrorLine`, `DWEET_LINE_OFFSET`
- Produces the message protocol. Requests go main → runtime; every request carries `id` and gets exactly one reply `{type:'reply', id, error:{message, line}|null, console:string, bitmap?:ImageBitmap}`:
  - `{type:'load', id, mode:'dweet'|'three'|'shadertoy'|'html'|'js'|'littlejs', code, width, height, background:string|null, loopProtect:boolean}` resets all state.
  - `{type:'setCode', id, code}` hot-swaps `u`, keeping the canvas and globals ("rebuild").
  - `{type:'frames', id, frames:number[], budgetMs:number, grab:boolean}` runs `u` once per step index, in order. When `grab` is set, the reply carries `bitmap` of the final canvas state.
  - `{type:'grab', id}` replies with `bitmap`, or `null` for html/js.
  - `{type:'image', id, bitmap:ImageBitmap|null}` and `{type:'mouse', id, x, y, z, w}`.
  - Worker only: the first message is `{type:'init', id, canvas:OffscreenCanvas}` (transferred).
- `createRuntime({canvas, globalScope, now}) → {handle(msg) → Promise<reply>}`, exported from `runtime.js` and used by both entries.

Runtime behavior to implement:

- **dweet:** `globalScope` receives `c`, `x` (2D context), `S`, `C`, `T`, `R`, `PI`, `DrawImage`, `image`, plus `t`, `time` and `frame` per step. `console.log` is captured into the reply's `console` and reset each request. `u = new Function('t', code')`, wrapped with `wrapLoops` when `loopProtect`, where `__lg` checks `now() > deadline` every 1024 calls and throws `Error('Loop timed out')`. `deadline = now() + budgetMs` is set per `frames` request. Errors are caught per step, the remaining steps in that request are skipped, and `line` comes from `parseErrorLine(e.stack)`. After each step, if `c.width !== width && c.height === height`, set `c.height = Math.round(c.width*height/width) & ~1` while preserving pixels. That's the old "preserve aspect ratio" behavior, now always on.
- **shadertoy:** a WebGL2 context. Port `SetShader`/`UpdateShader` from `legacy/index.html:1566-1683` (same wrapper and uniforms). `iChannel0` is the custom image, or the previous frame when none is loaded. Compile/link errors return `line` parsed from `ERROR: 0:(\d+)`, minus the wrapper's line count. Create contexts with `preserveDrawingBuffer:true`.
- **three:** `const THREE = await import('three')`. Expose `THREE` and `renderer = new THREE.WebGLRenderer({canvas, preserveDrawingBuffer:true})` globally. Call `renderer.setClearColor(background)` when a background is given. `x = renderer.getContext()`. Never call `setSize` with style updates.
- **Grabbing:** `createImageBitmap(canvas)`.

`worker.js`: `self.onmessage` → `init` creates the runtime on the transferred canvas with `globalScope = self` → each message replies via `postMessage(reply, bitmap ? [bitmap] : [])`.

`frame.js` (inside `frame.html`, talking to `parent` via `postMessage`):
- `dweet`/`three`/`shadertoy`: creates `<canvas id="c">` sized `width×height`, CSS `width:100%;height:100%`, and runs the same runtime with `globalScope = window`.
- `html`: `document.open(); document.write(code); document.close()`, then replies.
- `js`: indirect-evals `wrapLoops(code)` once with a 2000 ms deadline and replies with errors and console output.
- `littlejs`: injects a `<script>` for `littlejsengine/dist/littlejs.js?url`, then the user code as a classic `<script>` (wrapped with `wrapLoops`, with a deadline refreshed by a `requestAnimationFrame` loop started first, budget 200 ms). Then it calls `engineInit(gameInit ?? noop, gameUpdate ?? noop, gameUpdatePost ?? noop, gameRender ?? noop, gameRenderPost ?? noop)` using whatever the user defined globally. `grab` is serviced at the end of the next `gameRenderPost`; frame.js passes its own `gameRenderPost` that calls the user's first. It runs `glCopyToContext(tmpCtx)`, since LittleJS has no preserveDrawingBuffer and the copy must happen inside the render. Then it draws `mainCanvas` and any other `<canvas>` above it onto `tmpCtx`, and calls `createImageBitmap(tmp)`.
- Runtime errors outside requests (`window.onerror`) are posted as `{type:'error', error:{message, line}}`.

- [ ] **Step 1: Write failing test**

```js
// tests/unit/runtime.test.js
import { test, expect } from 'vitest'
import { createRuntime } from '../../src/runner/runtime.js'
const fakeCanvas = () => { const calls = []; const ctx = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) }); return { width: 1920, height: 1080, getContext: () => ctx, calls } }
const setup = async (code, opts = {}) => {
  const canvas = fakeCanvas(), scope = {}
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
  const { rt, scope } = await setup('k=(k||0)+1')
  await rt.handle({ type: 'frames', id: 2, frames: [0, 1], budgetMs: 100, grab: false })
  await rt.handle({ type: 'setCode', id: 3, code: 'k+=10' })
  await rt.handle({ type: 'frames', id: 4, frames: [2], budgetMs: 100, grab: false })
  expect(scope.k).toBe(12)
})
```

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement `protocol.js`, `runtime.js`, `worker.js`, `frame.js`** as described above. Console lines join with `\n`, and multiple `console.log` arguments join with a space.

- [ ] **Step 4: Run `npx vitest run tests/unit/runtime.test.js`.** Expected: PASS.

- [ ] **Step 5: Commit** — `feat: shared runtime with worker and frame entries`

---

### Task 7: Main-side runner with watchdog, plus e2e harness

**Files:**
- Create: `src/runner/runner.js`, `dev/runner-harness.html`
- Test: `tests/e2e/runner.spec.js`

**Interfaces:**
- Consumes: protocol (Task 6), `resolveRunMode` (Task 3)
- Produces:
  - `createRunner({container: HTMLElement, mode: concrete, runMode: 'worker'|'page', width, height, background: string|null}) → Runner`
  - `Runner` properties: `mode`, `runMode`, `element` (the display element inside `container`), `supportsTime` (false for html/js/littlejs), `supportsCapture` (true only for dweet/three/shadertoy), `dead: boolean`
  - `Runner` methods:
    - `load(code, {loopProtect}) → Promise<{error}>`
    - `setCode(code) → Promise<{error}>`
    - `runFrames(frames: number[], {budgetMs = 500, grab = false} = {}) → Promise<{error, console, bitmap: ImageBitmap|null}>`
    - `grab() → Promise<ImageBitmap|null>`
    - `setImage(bitmap|null)`
    - `setMouse(x, y, z, w)`
    - `onAsyncError(fn)`
    - `destroy()`
  - Exported constants: `WORKER_BUDGET_MS = 500`, `PAGE_BUDGET_MS = 200`, `CAPTURE_BUDGET_MS = 10000`
  - Timeout error: `{message: 'Stopped: a frame took longer than 500 ms (infinite loop?)', line: null, timedOut: true}`, with the actual budget in the text

Behavior:
- **Worker mode:** create `<canvas>` (`width×height` attributes, CSS fills the element), `transferControlToOffscreen()`, `new Worker(new URL('./worker.js', import.meta.url), {type:'module'})`, then send `init`.
- **Watchdog:** each request gets a timer of its `budgetMs` (for `load`, 5000 ms, since three.js import plus setup can take a while). On expiry, `terminate()` the worker, replace the canvas element with a fresh one, set `dead = true` and resolve the pending request with the timeout error. While dead, every call resolves the timeout error immediately, except `load`, which rebuilds the worker and canvas.
- **Page mode:** create `<iframe src="frame.html" sandbox="allow-scripts allow-same-origin">`, wait for its `ready`, and talk via `contentWindow.postMessage`. There's no watchdog (the page's own thread hangs with it). Rely on `loopProtect`.
- **Ignore stale replies:** every request id is unique, and replies for unknown ids (from a destroyed or replaced worker) are dropped.
- **Mouse:** `element` listens for mouse events and computes Shadertoy `iMouse` like `legacy/index.html:719-740`, sending `mouse`.

`dev/runner-harness.html` imports `createRunner` and sets `window.harness = { createRunner, sample(runner, w = 32, h = 18) }`. `sample` grabs a bitmap, scales it to `w×h`, and returns the fraction of pixels that are non-transparent and non-white.

- [ ] **Step 1: Write failing e2e tests**

```js
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
```

`load` replies include `console` (for js mode). Make sure Task 6's js path returns it.

- [ ] **Step 2: Run `npx playwright test tests/e2e/runner.spec.js`.** Expected: FAIL.

- [ ] **Step 3: Implement `runner.js` and the harness** as above.

- [ ] **Step 4: Run the e2e tests.** Expected: PASS.

- [ ] **Step 5: Commit** — `feat: worker/page runners with watchdog`

---

### Task 8: Clock and app settings

**Files:**
- Create: `src/app/clock.js`, `src/app/settings.js`
- Test: `tests/unit/clock.test.js`, `tests/unit/settings.test.js`

**Interfaces:**
- Produces:
  - `createClock() → Clock`
  - `Clock` properties: `frame` (next step index), `playing: boolean`, `speed` (clamped 0..100; NaN → 0)
  - `Clock` methods:
    - `tick() → number[]`: steps due this display frame, computed as `acc += speed; n = floor(acc); acc -= n`. `acc` starts at `1 - 1e-6` after creation or reset, so the first tick at any speed > 0 yields a step. Returns `[]` when paused.
    - `step() → number[]`: exactly one step, then pauses
    - `seek(i) → number[]`: returns `[i]` and sets `frame = i+1`, leaving `playing` unchanged
    - `reset()`: `frame = 0`, accumulator 0
    - `time` getter: `frame/60`
  - `DEFAULT_SETTINGS = {theme:'capjs', fontSize:2.0, onChange:'restart', sidebarOpen:true, currentCreationId:null, capture:{format:'gif', width:960, height:540, seconds:2, fps:60, dither:'fs', speed:1, aspect:'fill'}}`
  - `loadSettings(storage = localStorage) → Settings` (deep-merged over defaults; corrupt JSON → defaults)
  - `saveSettings(settings, storage = localStorage)`
  - Key: `'capjs.settings'`

- [ ] **Step 1: Write failing tests**

```js
// tests/unit/clock.test.js
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
```

```js
// tests/unit/settings.test.js
import { test, expect } from 'vitest'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/app/settings.js'
const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v } } }
test('defaults, deep merge, corrupt JSON', () => {
  const s = mem()
  expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS)
  saveSettings({ ...DEFAULT_SETTINGS, capture: { fps: 30 } }, s)
  expect(loadSettings(s).capture).toEqual({ ...DEFAULT_SETTINGS.capture, fps: 30 })
  s.setItem('capjs.settings', '{nope'); expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS)
})
```

- [ ] **Step 2: Run both files.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** — `feat: fixed-step clock and settings store`

---

### Task 9: App shell, editor, live loop, transport, canvas panel

**Files:**
- Create: `src/ui/editor.js`, `src/ui/themes.js`, `src/ui/topbar.js`, `src/ui/transport.js`, `src/ui/canvasPanel.js`, `src/ui/statusBar.js`, `src/ui/errorBar.js`, `src/ui/download.js`, `src/app/session.js`
- Modify: `index.html` (full layout), `src/main.js`, `src/ui/layout.css`
- Test: `tests/e2e/app.spec.js`

**Interfaces:**
- Consumes: Tasks 2, 3, 7, 8
- Produces:
  - `createEditor(parent, {theme, fontSize, onChange(code, {origin}), keys:{pause, restart, step, save}}) → {getCode(), setCode(code, {silent}), setTheme(name), setFontSize(em), markError(line|null), focus()}`. Pasting a compressed dweet at position 0 of an empty doc replaces it with `uncompress(text)`. Word completion uses `completeAnyWord` on Ctrl+Space. Also includes search keymap, line numbers starting at 1, bracket matching and active line highlight.
  - `THEMES: Record<string, Extension>` with keys `capjs` (ported from `legacy/codemirror/theme/capjs.css`), `one-dark`, `light`.
  - `createSession({container, editor, clock, settings, library|null, ui}) → Session`
  - `Session` methods: `open({creation, version, draft})`, `restart()`, `rebuild()`, `togglePause()`, `step()`, `seek(i)`, `setImage(bitmap|null)`, `setCreationSettings(partial)`, `setMode(mode)`, `setRunMode(runMode)`, `getRunner()`, `suspendLive(bool)` (used by capture)
  - `Session` getters: `code`, `mode` (selected), `concreteMode`, `runMode` (resolved), `creationSettings`
  - `Session` events via `session.on(name, fn)`: `'state'` (time, playing, error, console), `'codeChanged'`
  - `window.capjsDebug = { sampleFrame(w = 32, h = 18) → Promise<number> (ink fraction, same rule as harness), session }`

Behavior:
- **Layout** matches the approved mockup (spec "Layout"). Element ids are used by e2e tests: `#mode-select`, `#runmode-select`, `#onchange-select`, `#theme-select`, `#fontsize-select`, `#btn-help`, `#canvas-host`, `#btn-restart`, `#btn-pause`, `#btn-step`, `#time-display`, `#time-slider` (1..1800), `#btn-fullscreen`, `#btn-screenshot`, `#bg-enabled`, `#bg-color`, `#cap-aspect`, `#image-input`, `#btn-image-clear`, `#canvas-width`, `#canvas-height`, `#creation-name`, `#modified-dot`, `#btn-save`, `#btn-fork`, `#btn-history`, `#btn-share`, `#editor`, `#char-count` (`"96 / 140"` for dweets; plain count otherwise), `#line-count`, `#byte-count`, `#btn-compress`, `#btn-minify`, `#error-bar` (hidden when empty), `#console-bar` (hidden when empty), `#safe-start` (overlay button "Click to run").
- **Live loop:** `requestAnimationFrame` → `clock.tick()` → if steps are non-empty and no request is in flight → `runner.runFrames(steps, {budgetMs: runMode === 'worker' ? WORKER_BUDGET_MS : PAGE_BUDGET_MS})`. Skip while a request is in flight (backpressure). An error pauses the clock and shows `#error-bar` with `Line N: message`, plus `editor.markError(line)`. The next successful run clears it.
- **On change:** debounce 300 ms. `restart` → recreate the runner if mode or runMode changed, otherwise `load`, then `clock.reset()` and play. `rebuild` → `setCode`, then run one frame at the current step. `nothing` → no-op. Every change also writes the draft (`library.setDraft`, debounced 500 ms) and updates `#modified-dot`.
- **Safe start:** on boot, if the resolved runMode is `page`, show `#safe-start` and don't load until it's clicked (or the user types or presses restart). Worker mode starts immediately.
- **Canvas panel:** canvas size and background are creation settings, applied by restart. Background sets CSS background on `element`. The custom image comes via file input or drag-drop onto `#canvas-host`, then `createImageBitmap(file)` → `session.setImage`, persisted to `kv.lastImage` as a Blob and restored on boot. Clear removes it.
- **Transport:** wires to the session. The slider calls `seek`, the display shows `time.toFixed(2)`, fullscreen calls `element.requestFullscreen()`, and screenshot is wired in Task 11. Alt keys come from the editor keymap and also work globally.
- When `!runner.supportsTime` (html/js/littlejs), the transport row is disabled. When `!runner.supportsCapture`, the Capture button is disabled with a tooltip saying why.
- **Compress / Minify** replace the editor text (dweet, js, three only). **Share** shows `buildShareUrl` in a prompt, as today.
- **Boot from a share link:** if `parseShareUrl(location.href)` returns a result, create a new creation from it (when the library is available), then strip the query with `history.replaceState`.
- **Without a library** (Task 10 adds it), boot opens an in-memory creation from template `dweet`.

- [ ] **Step 1: Write failing e2e tests**

```js
// tests/e2e/app.spec.js
import { test, expect } from '@playwright/test'
const typeCode = async (page, code) => { await page.click('#editor .cm-content'); await page.keyboard.press('Control+A'); await page.keyboard.insertText(code) }
const ink = (page) => page.evaluate(() => capjsDebug.sampleFrame())

test.beforeEach(async ({ page }) => { await page.goto('./'); await page.waitForFunction(() => window.capjsDebug) })

test('default program renders and editing re-renders', async ({ page }) => {
  await expect.poll(() => ink(page)).toBeGreaterThan(0)
  await typeCode(page, 'x.fillRect(0,0,1920,1080)')
  await expect.poll(() => ink(page)).toBeGreaterThan(0.95)
  await expect(page.locator('#char-count')).toHaveText('25 / 140')
})
test('errors show with a line number and clear when fixed', async ({ page }) => {
  await typeCode(page, 'x.fillRect(0,0,9,9)\nnope()')
  await expect(page.locator('#error-bar')).toContainText('Line 2')
  await typeCode(page, 'x.fillRect(0,0,9,9)')
  await expect(page.locator('#error-bar')).toBeHidden()
})
test('an infinite loop never freezes the editor', async ({ page }) => {
  await typeCode(page, 'for(;;){}')
  await expect(page.locator('#error-bar')).toContainText('Stopped', { timeout: 3000 })
  await page.keyboard.press('Control+A'); await page.keyboard.insertText('x.fillRect(0,0,1920,1080)')
  await expect.poll(() => ink(page)).toBeGreaterThan(0.95)
})
test('pause, step and slider move time', async ({ page }) => {
  await page.click('#btn-pause'); const t0 = await page.textContent('#time-display')
  await page.click('#btn-step'); await expect(page.locator('#time-display')).not.toHaveText(t0)
  await page.locator('#time-slider').fill('600'); await expect(page.locator('#time-display')).toHaveText('10.00')
})
test('pasting a compressed dweet uncompresses it; compress round-trips', async ({ page }) => {
  await typeCode(page, 'x.fillRect(0,0,9,9)'); await page.click('#btn-compress')
  const compressed = await page.evaluate(() => capjsDebug.session.code)
  expect(compressed.startsWith('eval(unescape(')).toBe(true)
  await page.click('#editor .cm-content'); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete')
  await page.evaluate(t => navigator.clipboard.writeText(t), compressed)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.keyboard.press('Control+V')
  await expect.poll(() => page.evaluate(() => capjsDebug.session.code)).toBe('x.fillRect(0,0,9,9);')
})
test('page-mode infinite loop saved as draft boots to safe start', async ({ page }) => {
  await typeCode(page, 'c.style.filter="none";for(;;){}')
  await page.waitForTimeout(800)
  await page.reload(); await page.waitForFunction(() => window.capjsDebug)
  await expect(page.locator('#safe-start')).toBeVisible()
  await expect(page.locator('#editor')).toContainText('for(;;)')
})
```

The last test relies on draft persistence from Task 10. Mark it `test.fixme` here and remove the `fixme` in Task 10 Step 4.

- [ ] **Step 2: Run `npx playwright test tests/e2e/app.spec.js`.** Expected: FAIL.

- [ ] **Step 3: Implement `editor.js` and `themes.js`.** Port colors from `legacy/codemirror/theme/capjs.css`.
- [ ] **Step 4: Implement `session.js`** (live loop, on-change debounce, safe start, errors, image).
- [ ] **Step 5: Implement the layout and panels** (`index.html`, `layout.css`, `topbar.js`, `transport.js`, `canvasPanel.js`, `statusBar.js`, `errorBar.js`, `download.js` with `downloadBlob(blob, filename)`), and wire everything in `main.js`. Settings changes call `saveSettings`.
- [ ] **Step 6: Run the e2e tests.** Expected: PASS (except the `fixme`).
- [ ] **Step 7: Commit** — `feat: app shell, CodeMirror editor, live loop, transport`

---

### Task 10: Library UI (sidebar, gallery, history, save/fork, drafts, backup)

**Files:**
- Create: `src/ui/sidebar.js`, `src/ui/gallery.js`, `src/ui/history.js`, `src/library/thumbnail.js`
- Modify: `src/main.js`, `src/app/session.js`, `index.html`, `src/ui/layout.css`
- Test: `tests/e2e/library.spec.js`

**Interfaces:**
- Consumes: Tasks 4, 5, 9
- Produces:
  - `makeThumbnail(bitmap, background: string|null) → Promise<Blob>`: 160×90, aspect `fill`, `image/webp` at quality 0.8, using `composeFrame` from Task 11. If Task 11 isn't merged yet, implement `computeDrawRect` and `composeFrame` here in `src/capture/aspect.js` with the Task 11 signatures and tests, and Task 11 reuses them.
  - Element ids: `#sidebar`, `#btn-sidebar-toggle`, `#btn-new`, `#template-menu` (buttons `[data-template=<id>]`), `.lib-item[data-id]` (thumbnail, name, `vN · age`), `#btn-show-all`, `#gallery` (overlay), `#gallery-search`, `#gallery-sort` (`recent`|`name`), `#gallery-deleted` (recently deleted list with `[data-restore]`, `[data-purge]`), `#btn-export`, `#btn-import` (hidden file input `#import-input`), `#history-panel` (rows `[data-version-id]` with "Open" and "Fork" buttons), `#btn-discard` (revert draft), `#backup-nudge`, `#library-error`

Behavior:
- **Boot:** `openLibrary()`. If it throws, show `#library-error` ("Library unavailable — saving is disabled") and continue in in-memory mode. Otherwise open `settings.currentCreationId` (or the most recent creation; or, if the library is empty, create one from template `dweet`), restoring its draft when present.
- **Save** (button or Ctrl+S): `runner.grab()` → `makeThumbnail` (null if the runner can't grab) → `library.saveVersion` → refresh the sidebar and clear `#modified-dot`.
- **Fork:** `library.fork(current, viewedVersion ?? head)`, then open it.
- **History:** "Open" loads that version's code into the editor as the current draft; Save then makes a new version on top. "Fork" forks from it.
- **Switching creations:** the current draft is already persisted by Task 9's debounce. Flush it immediately before switching, then open the other creation with its own draft.
- **New** opens `#template-menu`. Choosing a template calls `createCreation({name: template.name, mode: template.mode, code: template.code})` and opens it.
- **Sidebar:** the 30 most recently updated live creations. `#btn-sidebar-toggle` collapses or expands it (slide), persisted in `settings.sidebarOpen`. Rename by editing `#creation-name` (commit on blur or Enter). Each item has a delete action with `confirm()`.
- **Gallery:** a thumbnail grid of all live creations, filtered by case-insensitive name substring, sorted by recent or name, plus the recently deleted section.
- **Export:** `exportLibrary` → `downloadBlob(JSON, backupFileName(now))`.
- **Import:** for a `.json` file, `importLibrary`, then an alert with counts, or the error message. For one or more `.txt`/`.js`/`.html` files, `importTextFiles`. Dropping files onto `#sidebar` or `#gallery` does the same.
- **Backup nudge:** show `#backup-nudge` (with an Export button) when `savesSinceExport > 0` and `now − (lastExportAt ?? firstSaveAt) > 14 days`. Store `firstSaveAt` in kv on the first save.

- [ ] **Step 1: Write failing e2e tests**

```js
// tests/e2e/library.spec.js
import { test, expect } from '@playwright/test'
const typeCode = async (page, code) => { await page.click('#editor .cm-content'); await page.keyboard.press('Control+A'); await page.keyboard.insertText(code) }
const code = (page) => page.evaluate(() => capjsDebug.session.code)
test.beforeEach(async ({ page }) => { await page.goto('./'); await page.waitForFunction(() => window.capjsDebug) })

test('save adds a version with a thumbnail; history can reopen v1', async ({ page }) => {
  await typeCode(page, 'x.fillRect(0,0,99,99)')
  await expect(page.locator('#modified-dot')).toBeVisible()
  await page.keyboard.press('Control+S')
  await expect(page.locator('#modified-dot')).toBeHidden()
  await expect(page.locator('.lib-item').first()).toContainText('v2')
  await expect(page.locator('.lib-item img').first()).toHaveAttribute('src', /^blob:/)
  await page.click('#btn-history'); await page.locator('#history-panel [data-version-id]').last().getByText('Open').click()
  expect(await code(page)).not.toBe('x.fillRect(0,0,99,99)')
})
test('fork creates a second creation; switching keeps unsaved drafts', async ({ page }) => {
  await page.click('#btn-fork')
  await expect(page.locator('.lib-item')).toHaveCount(2)
  await typeCode(page, 'draftA()')
  await page.locator('.lib-item').nth(1).click()
  await page.locator('.lib-item').nth(0).click()
  await expect.poll(() => code(page)).toBe('draftA()')
})
test('new from template, delete, restore from gallery', async ({ page }) => {
  await page.click('#btn-new'); await page.click('[data-template="shadertoy"]')
  await expect(page.locator('#editor')).toContainText('mainImage')
  page.on('dialog', d => d.accept())
  const n = await page.locator('.lib-item').count()
  await page.locator('.lib-item').first().getByTitle('Delete').click()
  await expect(page.locator('.lib-item')).toHaveCount(n - 1)
  await page.click('#btn-show-all'); await page.locator('#gallery-deleted [data-restore]').first().click()
  await expect(page.locator('.lib-item')).toHaveCount(n)
})
test('export then import into a fresh profile restores the library', async ({ page, browser }) => {
  await typeCode(page, 'exported()'); await page.keyboard.press('Control+S')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')])
  const ctx = await browser.newContext(); const p2 = await ctx.newPage()
  await p2.goto('./'); await p2.waitForFunction(() => window.capjsDebug)
  p2.on('dialog', d => d.accept())
  await p2.setInputFiles('#import-input', await dl.path())
  await expect(p2.locator('.lib-item')).toHaveCount(2)
})
test('bulk .txt import and sidebar collapse persists', async ({ page }) => {
  await page.setInputFiles('#import-input', [{ name: 'old one.txt', mimeType: 'text/plain', buffer: Buffer.from('x.fillRect(0,0,9,9)') }])
  await expect(page.locator('.lib-item', { hasText: 'old one' })).toBeVisible()
  await page.click('#btn-sidebar-toggle'); await page.reload(); await page.waitForFunction(() => window.capjsDebug)
  await expect(page.locator('#sidebar')).toHaveClass(/collapsed/)
})
test('library unavailable still lets you code', async ({ page }) => {
  await page.addInitScript(() => { indexedDB.open = () => { throw new Error('blocked') } })
  await page.goto('./'); await page.waitForFunction(() => window.capjsDebug)
  await expect(page.locator('#library-error')).toBeVisible()
  await expect.poll(() => page.evaluate(() => capjsDebug.sampleFrame())).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `thumbnail.js`, `sidebar.js`, `gallery.js` and `history.js`, then wire the library into `main.js` and `session.js`.
- [ ] **Step 4: Remove `test.fixme` from the safe-start test in `app.spec.js`.** Run `npx playwright test tests/e2e/library.spec.js tests/e2e/app.spec.js`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: library sidebar, gallery, history, backup UI`

---

### Task 11: Capture (GIF with global palette and dithering, WebM, screenshot)

**Files:**
- Create: `src/capture/aspect.js`, `src/capture/schedule.js`, `src/capture/gifEncode.js`, `src/capture/gifWorker.js`, `src/capture/webm.js`, `src/capture/capture.js`, `src/ui/capturePanel.js`, `src/ui/gifPreview.js`, `tests/helpers/gifParse.js`
- Modify: `src/main.js`, `src/ui/transport.js` (screenshot), `index.html`
- Test: `tests/unit/aspect.test.js`, `tests/unit/schedule.test.js`, `tests/unit/gifEncode.test.js`, `tests/e2e/capture.spec.js`

**Interfaces:**
- Consumes: `Runner`, `Session.suspendLive`, `CAPTURE_BUDGET_MS`, `downloadBlob`
- Produces:
  - `computeDrawRect(srcW, srcH, dstW, dstH, aspect: 'fill'|'fit'|'center'|'stretch') → {x, y, w, h}`
  - `composeFrame(ctx2d, bitmap, {dstW, dstH, aspect, background: string|null})` clears, fills the background if given, then draws
  - `GIF_MAX_FPS = 50`
  - `effectiveFps(format, fps) → number` (gif: `min(fps, 50)`)
  - `captureTargets({seconds, fps, speed}) → number[]`: captured frame k shows the program after step `Math.floor(k*60*speed/fps)`; length is `Math.round(seconds*fps)`
  - `gifDelays(fps, count) → number[]` (ms, centisecond-accurate accumulation)
  - `estimateCaptureBytes({width, height, seconds, fps}) → number` (= w·h·4·frames)
  - `MAX_CAPTURE_BYTES = 1.5e9`
  - `GIF_SIZE_LIMIT = 15_000_000`
  - `buildGlobalPalette(frames: Uint8ClampedArray[], maxColors = 255) → number[][]`: samples at most 500,000 pixels evenly across all frames, then gifenc `quantize(sample, maxColors, {format:'rgb565'})`
  - `mapFrame(rgba, width, height, palette, dither: 'none'|'fs'|'bayer', cache: Map) → Uint8Array`: nearest via gifenc `nearestColorIndex`, cached by rgb565 key. `fs` is Floyd–Steinberg on a float copy. `bayer` adds `(BAYER8[y&7][x&7]/64 − 0.5)·24` per channel before lookup.
  - `markUnchanged(indices, prev, transparentIndex) → Uint8Array`: copy where `indices[i] === prev[i]` becomes `transparentIndex`
  - `encodeGif(frames, width, height, {fps, dither, onProgress}) → Uint8Array`: a 255-color palette plus transparent index 255 (palette padded to 256). Only frame 0 passes `palette`, so there's one global table and no local tables. Frames after 0 get `markUnchanged` against the previous frame's indices, with `transparent:true, transparentIndex:255, dispose:1`. Delays come from `gifDelays(fps)`. Loops forever.
  - `encodeWebm(frames: ImageBitmap[]|ImageData[], width, height, fps) → Promise<Blob>`: WebCodecs `VideoEncoder` (`vp09.00.10.08`) plus `webm-muxer` `ArrayBufferTarget`. Width and height are rounded down to even numbers.
  - `runCapture({session, settings: capture, creationSettings, onProgress, signal}) → Promise<{blob, format, bytes, overLimit}>`

Behavior of `runCapture`:
1. Reject with a message if `!runner.supportsCapture`, or if `estimateCaptureBytes(...) > MAX_CAPTURE_BYTES` ("This capture needs about X GB of memory. Try a smaller size, fewer seconds, or 30 fps.").
2. `session.suspendLive(true)`. Snapshot the code. Create a dedicated runner (same mode and runMode, hidden container) and `load` it, with `loopProtect` in page mode.
3. Walk `captureTargets` at `effectiveFps`. For each target, `runFrames(steps since last target, {grab:true, budgetMs: CAPTURE_BUDGET_MS})`; when there are no new steps (speed < 1), reuse the previous bitmap. `composeFrame` onto a `width×height` canvas with background and aspect, then `getImageData` (GIF) or keep the bitmap (WebM). On error, abort with the message.
4. GIF: post the frames to `gifWorker` (transferring buffers), with progress. WebM: `encodeWebm`.
5. Always destroy the capture runner and `suspendLive(false)` in `finally`.

UI:
- `capturePanel.js` wires `#cap-format` (`gif`|`webm`), `#cap-width`, `#cap-height`, `#cap-seconds`, `#cap-fps` (30|60), `#cap-dither` (`none`|`fs`|`bayer`, shown only for GIF), `#cap-speed`, `#btn-capture`, and `#capture-progress`. When GIF is chosen with 60 fps, show a hint "GIFs play at 50 fps max".
- `gifPreview.js` opens `#gif-preview` (an `<img>` from the blob URL, `#gif-size` in MB, `#gif-warning` when `overLimit`, `#btn-gif-download`, and a close button). WebM downloads directly.
- Filenames are `${creationName}.gif` / `.webm`.
- `#btn-screenshot` grabs the live runner, composes at capture width/height with the aspect and background, and downloads `${name}.png`.

- [ ] **Step 1: Write failing unit tests**

```js
// tests/unit/aspect.test.js
import { test, expect } from 'vitest'
import { computeDrawRect } from '../../src/capture/aspect.js'
test('aspect modes map 1920x1080 into 800x600', () => {
  const r = a => Object.fromEntries(Object.entries(computeDrawRect(1920, 1080, 800, 600, a)).map(([k, v]) => [k, +v.toFixed(2)]))
  expect(r('fill')).toEqual({ x: -133.33, y: 0, w: 1066.67, h: 600 })
  expect(r('fit')).toEqual({ x: 0, y: 75, w: 800, h: 450 })
  expect(r('center')).toEqual({ x: -560, y: -240, w: 1920, h: 1080 })
  expect(r('stretch')).toEqual({ x: 0, y: 0, w: 800, h: 600 })
})
```

```js
// tests/unit/schedule.test.js
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
```

```js
// tests/unit/gifEncode.test.js
import { test, expect } from 'vitest'
import { buildGlobalPalette, mapFrame, markUnchanged, encodeGif } from '../../src/capture/gifEncode.js'
import { parseGif } from '../helpers/gifParse.js'
const solid = (w, h, f) => { const a = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) a.set([...f(i % w, (i / w) | 0), 255], i * 4); return a }
const W = 16, H = 8
const f1 = solid(W, H, x => x < 8 ? [255, 0, 0] : [0, 0, 255])
const f2 = solid(W, H, (x, y) => x === 0 && y === 0 ? [0, 255, 0] : x < 8 ? [255, 0, 0] : [0, 0, 255])

test('one global palette for all frames, no local tables, loops forever', () => {
  const gif = parseGif(encodeGif([f1, f2], W, H, { fps: 50, dither: 'none' }))
  expect(gif.header).toBe('GIF89a')
  expect(gif.globalColorTable).toBe(true)
  expect(gif.frames).toHaveLength(2)
  expect(gif.frames.every(f => !f.localColorTable)).toBe(true)
  expect(gif.frames.map(f => f.delayCs)).toEqual([2, 2])
  expect(gif.loopCount).toBe(0)
})
test('palette contains the colors of every frame', () => {
  const pal = buildGlobalPalette([f1, f2])
  for (const c of [[255, 0, 0], [0, 0, 255], [0, 255, 0]])
    expect(pal.some(p => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) < 24), String(c)).toBe(true)
})
test('unchanged pixels become transparent', () => {
  expect([...markUnchanged(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 9, 3]), 255)]).toEqual([255, 2, 255])
})
test('dithering modes are deterministic and produce valid indices', () => {
  const grad = solid(W, H, x => [x * 16, x * 16, x * 16])
  const pal = [[0, 0, 0], [255, 255, 255]]
  for (const d of ['none', 'fs', 'bayer']) {
    const a = mapFrame(grad, W, H, pal, d, new Map()), b = mapFrame(grad, W, H, pal, d, new Map())
    expect([...a]).toEqual([...b]); expect(a.every(i => i < 2)).toBe(true)
  }
  expect(new Set(mapFrame(grad, W, H, pal, 'fs', new Map()).slice(4, 12)).size).toBe(2)
})
```

`tests/helpers/gifParse.js` exports `parseGif(bytes: Uint8Array) → {header, width, height, globalColorTable:boolean, loopCount:number|null, frames:{delayCs, transparentIndex|null, disposal, localColorTable:boolean}[]}`. It walks blocks only (header, LSD, GCT, extensions 0x21 with sub-blocks, image descriptors 0x2C with LZW sub-blocks skipped, trailer 0x3B) and doesn't decode pixels.

- [ ] **Step 2: Run the unit tests.** Expected: FAIL.
- [ ] **Step 3: Implement `aspect.js`, `schedule.js`, `gifEncode.js` and `gifParse.js`.** Run the unit tests. Expected: PASS.
- [ ] **Step 4: Write failing e2e tests**

```js
// tests/e2e/capture.spec.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { parseGif } from '../helpers/gifParse.js'
test.beforeEach(async ({ page }) => { await page.goto('./'); await page.waitForFunction(() => window.capjsDebug) })
const setCap = async (page, o) => { for (const [k, v] of Object.entries(o)) await page.locator('#cap-' + k).fill(String(v)) }

test('GIF capture: preview, size, single palette, right frame count, unaffected by typing', async ({ page }) => {
  await setCap(page, { width: 320, height: 180, seconds: 1 })
  await page.selectOption('#cap-fps', '30')
  await page.click('#btn-capture')
  await page.click('#editor .cm-content'); await page.keyboard.insertText('//typing during capture')
  await expect(page.locator('#gif-preview')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#gif-size')).toContainText('MB')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-gif-download')])
  const gif = parseGif(new Uint8Array(fs.readFileSync(await dl.path())))
  expect(gif.width).toBe(320); expect(gif.frames).toHaveLength(30)
  expect(gif.frames.every(f => !f.localColorTable)).toBe(true)
})
test('oversized capture is refused up front', async ({ page }) => {
  await setCap(page, { width: 1920, height: 1080, seconds: 20 })
  page.on('dialog', d => d.accept())
  await page.click('#btn-capture')
  await expect(page.locator('#capture-message')).toContainText('GB of memory')
  await expect(page.locator('#gif-preview')).toBeHidden()
})
test('WebM and screenshot download', async ({ page }) => {
  await setCap(page, { width: 320, height: 180, seconds: 0.5 })
  await page.selectOption('#cap-format', 'webm')
  const [webm] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btn-capture')])
  expect(fs.statSync(await webm.path()).size).toBeGreaterThan(1000)
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('#btn-screenshot')])
  expect(png.suggestedFilename()).toMatch(/\.png$/)
})
```

Add `#capture-message` (inline text under the Capture button) to the produced ids.

- [ ] **Step 5: Run `npx playwright test tests/e2e/capture.spec.js`.** Expected: FAIL.
- [ ] **Step 6: Implement `gifWorker.js`, `webm.js`, `capture.js`, `capturePanel.js` and `gifPreview.js`, plus the screenshot.**
- [ ] **Step 7: Run the capture e2e tests and the whole unit suite.** Expected: PASS.
- [ ] **Step 8: Commit** — `feat: deterministic capture with global-palette GIF, dithering, WebM`

---

### Task 12: Help panel and onboarding

**Files:**
- Create: `src/ui/help.js`
- Modify: `index.html`, `src/ui/layout.css`, `src/main.js`
- Test: add to `tests/e2e/app.spec.js`

**Interfaces:**
- Produces: `#help-panel`, an overlay toggled by `#btn-help` and closed by Esc. It contains:
  - a three-line "how it works" (write code → it runs live → Save keeps versions, Capture makes a GIF)
  - the keyboard shortcuts from Global Constraints
  - globals per mode (dweet globals from the spec; Shadertoy uniforms; three.js `THREE`/`renderer`; LittleJS "write `gameInit`/`gameUpdate`/`gameRender` — all optional")
  - a "Start from a template" row of the `TEMPLATES` buttons, which create and open a creation
- First run: when the library had no creations before boot, open the help panel once (`kv.helpShown`).

- [ ] **Step 1: Write failing test**

```js
test('help opens, lists shortcuts, starts a template', async ({ page }) => {
  await page.click('#btn-help')
  await expect(page.locator('#help-panel')).toContainText('Alt+Up')
  await page.locator('#help-panel [data-template="three"]').click()
  await expect(page.locator('#help-panel')).toBeHidden()
  await expect(page.locator('#editor')).toContainText('THREE')
})
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `help.js` and the markup.**
- [ ] **Step 4: Run `npx playwright test tests/e2e/app.spec.js`.** Expected: PASS.
- [ ] **Step 5: Commit** — `feat: help panel and first-run onboarding`

---

### Task 13: Remove legacy, final verification

**Files:**
- Delete: `legacy/`
- Modify: `README.md` (feature list, shortcuts, backup advice)

- [ ] **Step 1: Check that nothing imports from `legacy/`:** `git grep -n legacy -- src tests index.html frame.html vite.config.js` returns nothing.
- [ ] **Step 2: `git rm -r legacy`**
- [ ] **Step 3: Run `npm test`, `npm run e2e` and `npm run build`.** All pass.
- [ ] **Step 4: Run `npm run preview`, open `http://localhost:4173/CapJS/` and check by hand:**
  - a dweet runs
  - Save, Fork and History work
  - a 2 s GIF of the default program at 960×540 previews without flicker
  - Export then Import works
  - three.js, Shadertoy, HTML, JS and LittleJS templates all run
- [ ] **Step 5: Update `README.md`.**
- [ ] **Step 6: Commit** — `chore: remove legacy app`
