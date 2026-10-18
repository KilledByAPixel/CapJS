# CapJS Rewrite — Design

Date: 2026-10-16
Owner: Frank Force

## Intent

CapJS is a live code editor Frank uses constantly to write, run, and record dweets (Dwitter-style 140-character JS canvas programs), plus shaders, three.js scenes, and small HTML/JS experiments. The current app (`index.html`, a single 1,800-line file from 2019) works and Frank likes it, but it has grown sloppy and has four real pain points:

1. **Saving.** Every save downloads another `.txt` file, so his disk has a long pile of near-duplicate copies. He wants a library inside the app.
2. **Getting started.** He retypes boilerplate constantly. He wants templates.
3. **GIF quality.** GIFs are the main output (posted to Twitter and similar sites), but each frame gets its own palette, which causes flicker. There's no dithering. His workaround is exporting PNG frames and building the GIF in GIMP, which is slow and painful.
4. **Freezes.** A typo in a loop condition can lock up the whole page for a long time before the loop buster catches it.

The rewrite is "what we have, but better." It is a complete rewrite. Frank does not need to review the old code, and the new code does not need to resemble it. The old `index.html` stays in git history as a reference for current behavior.

## Goals

- In-app library with save, version history, fork, templates, thumbnails, and export/import.
- GIFs good enough that Frank never needs GIMP: one global palette, dithering, under 15 MB.
- An infinite loop can never freeze the editor in the default run mode, and is caught fast in the fallback mode.
- Keep the current feel: big canvas, big editor, every control visible, fast to use.
- Clean, modular code (separate JS files), built and deployed to GitHub Pages.
- Structure that won't block a future node graph (see Future).

## Non-goals (first version)

- Node graph / multi-pass (programs feeding images into each other). Design for it, don't build it.
- Multi-pass Shadertoy (Buffer A/B). Shadertoy stays single-pass.
- Mobile support. It must not be broken on purpose, but no mobile work.
- Smart / context-aware autocomplete. Plain Ctrl+Space word completion is enough.
- New share-link work. (The existing share link is ported as-is; see Sharing.)
- PNG/JPG frame-sequence capture (it only existed to work around bad GIFs).
- Watch window, mini-beautifier, Beautify button, GLSL mode.

## Anti-goals

- Losing the simplicity. If the new UI makes Frank hunt for a control, or adds clicks to the edit → run → capture loop, it has failed even if every feature works.
- Hiding controls behind an "advanced" toggle. Today's toggle is always left open anyway.
- GIFs that still flicker, or that routinely blow past 15 MB with no warning.
- An editor that can still be frozen by a bad loop in default mode.
- Losing library data silently.

## Constraints

- Hosted on **GitHub Pages**, single origin. This is a **new address**: the old app lives on Frank's own web server and stays there. Primarily used in desktop Chrome.
- A small **build step is OK** (Frank's call) if it gets a better editor. Deployment should be automatic on push (see Build & Deploy).
- No backend. All data lives in the browser.
- Frank prefers a large editor font.

## Decisions Frank made

### Library

- Creations live in the browser. Frank agreed to **IndexedDB**.
- Each creation has: name, mode, code, thumbnail, version history, and settings relevant to running it.
- **Save** is the everyday action: it updates the current creation and adds a version to its history. Frank mostly iterates on one thing.
- **Version history** is wanted: a list per creation where any old version can be opened or forked from.
- **Fork** copies the current creation into a new one, used occasionally to take an idea somewhere else. The fork remembers its parent.
- **Thumbnail**: on save, whatever the canvas is currently showing is scaled down and stored. Only code and thumbnails are stored, never GIFs.
- **Templates**: starting points for each kind of program.
- **Export** downloads the entire library as one backup file. **Import** merges it back in. Duplicates are skipped, not doubled, so importing the same backup twice is harmless.
- **Layout: option C.** A sidebar of recent creations with thumbnails for quick switching, plus a "show all" button that opens a full gallery (thumbnail grid, search, sort) over the app.
- The sidebar can be **collapsed/hidden** (or slides out) to give the canvas and editor more room. The app remembers its state.

### Modes

Keep: **dweet** (Dwitter + CapJS globals), **plain JS**, **HTML**, **three.js**, **Shadertoy**. Add: **LittleJS**. Drop: **GLSL**. Auto-detect mode from code, as today, with a manual override.

**LittleJS mode** works like the LittleJS "shorts" examples: the user writes plain code, the app calls `engineInit` itself, and `gameInit`, `gameUpdate`, `gameUpdatePost`, `gameRender`, `gameRenderPost` are all optional. Defining any of them overrides the default no-op.

**LittleJS is live view only (Frank's call, to keep things simple).** No GIF/WebM capture, and no time slider or pause/step. LittleJS runs its own loop. Frank thinks hooking into LittleJS later (a plugin or wrapper that hands frames to the recorder) may not be hard, so the runner interface shouldn't rule it out, but it's not in this version.

### Running code safely

- **Default: background worker.** User code runs in a Web Worker drawing to an `OffscreenCanvas`. If a frame doesn't finish in time, the main page kills the worker and restarts it. The editor never freezes.
- **Full page mode** is the fallback and works like today, with full access to `document`, `c.style`, DOM, etc. It's protected by an improved loop buster: a much shorter time budget, checked more often than every 4,096 iterations.
- **Auto-detect**: the app scans code for things a worker can't do (`document`, `.style`, `body`, `window`, DOM APIs, etc.) and switches to full page mode when found. Manual override in the top bar ("Runs in: auto / worker / full page").
- Frank agreed that this limited worker mode is the right default.

### Recording

- **GIF is the main format.** One **global palette** (256 colors) for the whole GIF. **Dithering options.** Target **under 15 MB**.
- **WebM stays** (cheap to keep, even if rarely used).
- **Screenshot** (single PNG) stays.
- PNG/JPG frame sequences are dropped.

### Controls (all kept unless noted)

Time slider, pause, single-step, restart. Theme and font size (large default). Custom image input. Background color (on by default, white, matching Dwitter). Fullscreen. Screenshot. Capture resolution, aspect (fill/fit/center/stretch), speed, framerate (30/60), and seconds. Line/character/byte counter. Compress (Dwitter 2:1 unicode compression, the button Frank actually uses). Minify only if it's a simple, cheap function. Mode picker and on-change behavior (restart / rebuild / do nothing). Help panel, reworked (see below).

Cut: watch window, mini-beautifier, Beautify.

### Custom image

The image is an **input, not part of the creation**. Frank writes image-manipulation code and feeds different images through it. It must **not** be saved with the creation.

### Layout

Approved mockup (`.superpowers/brainstorm/*/content/overall-layout.html`):

- **Top bar:** app name, Mode, Runs in, On change, Theme, font size, Help.
- **Left:** collapsible library sidebar (recent creations with thumbnails, + New, Show all…, Export/Import).
- **Middle column:** the canvas, then a transport row (restart, pause, step, time readout, time slider, fullscreen, screenshot). Below that, two always-visible labeled boxes:
  - **Capture:** format, size, seconds, FPS, dither, speed, and a big Capture button.
  - **Canvas:** background color plus on/off, aspect, image (with clear), canvas size.
- **Right (takes remaining width):** creation name (editable) with Save, Fork, History; the big editor; a status row with character count against 140, lines, bytes, then Compress and Minify.
- Errors show as a red bar under the editor, only when there is one.

The same spirit as today's app, just tidier.

### Help / onboarding

The current help panel is weak. Rework it so a newcomer can get going. Templates carry a lot of this: each one is a working, commented example.

### Build & deploy

Frank is fine with a build step. He wants help setting up GitHub Pages to serve the build.

## Calls I made (Frank can override)

- **Editor: CodeMirror 6**, bundled with **Vite**. Keep the shortcuts: Alt+Up pause, Alt+Down/Alt+Enter restart, Alt+Right step, Ctrl+Space completion, search/replace, jump to line. Add **Ctrl+S = Save** to library. Keep a few themes, including a port of the current "capjs" theme as default.
- **Deploy:** a GitHub Actions workflow builds on push to the main branch and publishes to GitHub Pages. No build output is committed. The repo currently has no remote; Frank will create the GitHub repo.
- **Vendored dependencies** (three.js, LittleJS, GIF encoder) are installed via npm and bundled, not loaded from CDNs at runtime. Pin versions. three.js gets upgraded to a current version; old three.js dweets that break on API changes are acceptable.
- **Version records** store code plus mode plus run settings (canvas size, background, run mode). Capture settings stay app-level, not per creation.
- **Thumbnails** are small (about 160×90 JPEG/WebP blobs).
- **Export format:** one JSON file containing creations, versions, and thumbnails (base64). Every creation and version has a permanent random ID. Import adds anything whose ID isn't present and skips the rest. If a creation exists but the backup has newer versions of it, those versions are added.
- **Backup nudge:** a gentle reminder to export if it's been a while (e.g. 2+ weeks and new saves since the last export). Request persistent storage (`navigator.storage.persist()`) so the browser is less likely to evict the database.
- **Unsaved work:** the current editor contents are autosaved continuously as a draft (like today's localStorage behavior), so a reload never loses work. A draft is separate from a saved version. The name shows a "modified" dot when the draft differs from the last saved version.
- **Bulk import of old files:** dragging one or many `.txt` files onto the library creates one creation per file, named from the filename, mode auto-detected. This is how Frank migrates his pile of saved dweets.
- **No automatic migration.** The new app is on a different origin, so it can't read the old app's localStorage. Frank's old programs come in through bulk `.txt` import.
- **Vite `base`** is set for a project page at `/CapJS/` (repo name), as one config value so it's easy to change for a custom domain.
- **LittleJS screenshot and thumbnail:** composite LittleJS's canvases (main, WebGL, overlay) into one image. If that turns out to be awkward, fall back to the placeholder thumbnail.
- **Templates** (built-in, read-only, start a new creation): dweet (the current default program), plain JS, HTML, three.js (the current help example), Shadertoy (the current help example), LittleJS short. Built-in templates are a fixed list in code. Promoting a user creation to a template is a nice-to-have, not required.
- **Re-run debounce:** in "restart" and "rebuild" on-change modes, code re-runs after a short pause in typing (~300 ms), not on every keystroke, so half-typed loops mostly never execute.
- **GIF pipeline:** capture all frames at the capture resolution first, then build one palette from pixels sampled across all frames, then encode. Dither choices: none, error diffusion (Floyd–Steinberg), ordered (Bayer). Unchanged pixels between frames are encoded as transparent to shrink the file. Show a preview of the finished GIF with its file size before downloading. Warn when it's over 15 MB, with suggestions (smaller size, fewer seconds, 30 fps). Encoding runs in a worker with a progress bar. A library like `gifenc` is a reasonable choice; the builder may pick another.
- **WebM:** frames are produced deterministically (not real-time), then encoded with WebCodecs or a small WebM writer.
- **Sharing:** the current Share button (URL with `filename`, `mode`, and JSONCrush'd `crushed` param) is ported as-is, and incoming share links in that format load in the new app. Links already shared point at Frank's server and keep working there. No new sharing features.
- **Shadertoy feedback:** today, when no custom image is loaded, `iChannel0` is the previous frame of the canvas, which enables feedback effects. Preserve that.
- **Custom image persistence:** the app remembers the last loaded image (app-level, in IndexedDB) so it survives reloads and switching creations, until cleared or replaced. Load by file picker or drag-drop onto the canvas. Available as `image` in dweet/JS, `iChannel0` in Shadertoy, and accessible in three.js and LittleJS.
- **"Runs in" for each mode:** dweet, three.js, and Shadertoy use auto (worker by default). HTML, plain JS, and LittleJS always use full page.
- **Plain JS keeps its old meaning:** the code runs once on a blank page, with no `c`, no `u(t)` loop, and no capture. It is for DOM/console experiments. It is never auto-detected; you pick it by hand, as today.
- **HTML stays uncapturable** (as today). Its library thumbnail is a generic placeholder for the mode. The same goes for plain JS.
- **Drafts are per creation.** Each creation keeps its own unsaved draft. Switching creations never prompts and never loses edits. Coming back restores the draft, and the modified dot stays until you Save. A draft can be discarded (revert to the last saved version).
- **Delete:** creations can be deleted from the sidebar or gallery, with confirmation. A deleted creation leaves a tombstone (its ID and deletion time), and tombstones go into exports. Import never brings back a creation the library has a tombstone for. A "recently deleted" list in the gallery can restore one, which removes its tombstone.

## Current behavior to preserve (from old `index.html`)

The builder should read the old file for exact details. Highlights:

- **Dweet runtime:** `u(t)` is called at a fixed 60 steps per second of program time. `t = frame/60`, deterministic, independent of display rate. Speed multiplies steps per display frame. At 30 fps capture, two steps run per captured frame.
- **Dweet globals:** `c` (canvas, default 1920×1080), `x` (2D context, or WebGL context for three.js/Shadertoy), `t`, `S`/`C`/`T` (sin/cos/tan), `R(r,g,b,a)` (rgba string), `PI`, `image`, `DrawImage(img,x,y,sx,sy,angle)`, `frame`, `time`. `console.log` output is captured and shown in a console area.
- **Compressed dweets:** pasting a compressed `eval(unescape(escape`…`))` dweet at the start of an empty editor auto-uncompresses it. Compress is the reverse (the existing `DwitterCompress`/`Uncompress` logic).
- **Character counting** uses code points (`[...s].length`), and bytes are shown separately.
- **Canvas size** setting (default 1920×1080), with "preserve aspect ratio" when code sets `c.width`.
- **Capture aspect:** fill / fit / center / stretch, mapping canvas to capture resolution as the old `UpdateCaptureCanvas` does, with background color filled behind.
- **Shadertoy uniforms:** `iResolution`, `iTime`, `iTimeDelta`, `iFrame`, `iFrameRate`, `iMouse` (Shadertoy semantics), `iChannel0`. A `mainImage(out vec4, in vec2)` wrapper using WebGL2.
- **three.js:** the renderer is pre-created on `c` and exposed as `renderer`. `THREE` is global. Background color sets the clear color.
- **Safe start:** after a page load, code doesn't auto-run until the user interacts (so saved code that freezes can't lock the app on load). Keep this for full page mode. In worker mode it's unnecessary.
- **Errors** show with line numbers mapped back to the editor, and the line is highlighted.

## Future: node graph (design for, don't build)

Frank's idea: a network where each node is a whole program (a dweet, a shader, later other kinds), and nodes pass images to each other. A dweet could feed a shader as a texture for post-processing, or two dweets could feed a third that composites them.

What this means now:

- Each running program is a self-contained runner object with one output canvas and a list of image inputs. Today there's just one input, the custom image.
- Runners don't reach into the UI. The UI drives them through a small interface (load code, set inputs, step to time, get frame).
- Creations are self-describing (mode plus code plus run settings), so a node can later point at any saved creation.

## Left to the builder

- Module structure, file layout, naming.
- Exact visual styling within the approved layout and current dark look.
- Choice of GIF encoder / quantizer library, WebM approach, CodeMirror theme ports.
- Exact worker timeout, loop-buster budget, and detection regex.
- Exact gallery search/sort behavior.
- Content and wording of templates and help.
