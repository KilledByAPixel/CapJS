# CapJS

A browser live-code editor for dweets, shaders and canvas experiments. Write code on the left, see it run on the canvas, and capture GIF or WebM output. Everything runs in the browser with no backend; creations are stored locally in IndexedDB.

## Development

```
npm install
npm run dev      # start the dev server at http://localhost:5173/CapJS/
npm test         # unit tests (vitest)
npm run e2e      # end-to-end tests (playwright, chromium)
npm run build    # production build into dist/
```

Before running the e2e tests for the first time, install the browser with `npx playwright install chromium`.

## Deploying to GitHub Pages

One-time setup:

1. Create a GitHub repository named `CapJS` and push this project to it.
2. Go to Settings → Pages → Source and choose "GitHub Actions".

After that, every push to `main` builds and deploys the site via `.github/workflows/deploy.yml`.

The `base` option in `vite.config.js` (`/CapJS/`) must match the repository name, or be changed to `/` when using a custom domain.

The previous version of the app lives in `legacy/` until it is removed.
