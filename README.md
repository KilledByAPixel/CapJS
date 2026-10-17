# CapJS

A browser live-code editor for dweets, shaders and canvas experiments. Write code on the left, see it run on the canvas, and capture GIF or WebM output. Everything runs in the browser with no backend. Creations are stored locally in IndexedDB.

## Features

- Live editor (CodeMirror 6) with themes, font sizes, word completion and search.
- Modes: auto-detect, dweet, js, html, three.js, shadertoy and littlejs. Dweet, three.js and Shadertoy code can run in a worker so an infinite loop cannot freeze the editor; html, js and littlejs run on the page.
- Fixed-step time at 60 steps per second, with pause, single-step and a seek slider.
- Library of creations with versions: Save, Fork, History, revert to the last saved version, recently deleted, and a gallery with search.
- Share links that contain the code, plus Dwitter-style compress and minify with character, line and byte counts.
- Capture to GIF (global palette, selectable dithering) or WebM, with size, length, fps, speed and aspect options, and a GIF preview with size warning.
- Custom image (drop on the canvas) available to dweets and as iChannel0 in Shadertoy; screenshot and fullscreen.
- Export and Import of the whole library as one JSON file, and import of .txt, .js and .html programs.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Alt+Up | Pause / resume |
| Alt+Down or Alt+Enter | Restart |
| Alt+Right | Single step |
| Ctrl+S | Save |
| Ctrl+Space | Word completion |
| Ctrl+F | Search |

## Backing up your work

The library lives only in this browser (IndexedDB plus localStorage for settings). Clearing site data, using a private window or switching browsers or computers loses it. Use **Export** in the sidebar regularly and keep the file somewhere safe; **Import** restores it.

## Development

```
npm install
npm run dev      # start the dev server at http://localhost:5173/CapJS/
npm test         # unit tests (vitest)
npm run e2e      # end-to-end tests (playwright, chromium)
npm run build    # production build into dist/
npm run preview  # serve the build at http://localhost:4173/CapJS/
```

Before running the e2e tests for the first time, install the browser with `npx playwright install chromium`.

## Deploying to GitHub Pages

One-time setup:

1. Create a GitHub repository named `CapJS` and push this project to it.
2. Go to Settings → Pages → Source and choose "GitHub Actions".

After that, every push to `main` builds and deploys the site via `.github/workflows/deploy.yml`.

The `base` option in `vite.config.js` (`/CapJS/`) must match the repository name, or be changed to `/` when using a custom domain.

