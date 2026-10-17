// Help panel: an overlay with how it works, shortcuts, per-mode globals and a template row.
// createHelp({ templates, onTemplate }) -> { open, close, toggle, isOpen }.
// onTemplate(id) creates and opens a creation (the same action as the New menu).

const SHORTCUTS = [
  ['Alt+Up', 'Pause / resume'],
  ['Alt+Down, Alt+Enter', 'Restart'],
  ['Alt+Right', 'Single step'],
  ['Ctrl+S', 'Save'],
  ['Ctrl+Space', 'Word completion'],
  ['Ctrl+F', 'Search'],
]

const GLOBALS = [
  ['Dweet', [
    'c: the 1920×1080 canvas, x: its 2D context, t: time in seconds',
    'S, C, T: sin, cos, tan. PI. R(r,g,b,a): an rgba color string',
    'image: the custom image. DrawImage(img,x,y,sx,sy,angle). frame, time',
    'console.log output shows below the editor',
  ]],
  ['Shadertoy', [
    'mainImage(out vec4 fragColor, in vec2 fragCoord)',
    'iResolution, iTime, iTimeDelta, iFrame, iFrameRate, iMouse',
    'iChannel0: the custom image, or the previous frame when none is loaded',
  ]],
  ['three.js', ['THREE is global. renderer is already created on the canvas.']],
  ['LittleJS', [
    'Write gameInit, gameUpdate, gameRender: all optional. The app calls engineInit.',
    'Live view only: no capture.',
  ]],
]

function el(tag, props = {}, children = []) {
  const { dataset, ...rest } = props
  const node = Object.assign(document.createElement(tag), rest)
  Object.assign(node.dataset, dataset)
  node.append(...children)
  return node
}

export function createHelp({ templates, onTemplate }) {
  const panel = document.getElementById('help-panel')
  const close = () => { panel.hidden = true }
  const open = () => { panel.hidden = false }

  const section = (title, ...body) => el('section', {}, [el('h5', { textContent: title }), ...body])
  const list = items => el('ul', {}, items.map(text => el('li', { textContent: text })))

  const box = el('div', { className: 'help-box' }, [
    el('header', {}, [
      el('b', { textContent: 'CapJS help' }),
      el('span', { className: 'spacer' }),
      el('button', { id: 'btn-help-close', textContent: '✕', title: 'Close (Esc)', onclick: close }),
    ]),
    section('How it works', list([
      'Write code: the program runs live as you type.',
      'Save keeps versions of your creation (History lists them).',
      'Capture makes a GIF or WebM of what is on the canvas.',
    ])),
    section('Start from a template', el('div', { className: 'help-templates' }, templates.map(t => el('button', {
      textContent: t.name, title: `New ${t.name} creation`, dataset: { template: t.id },
    })))),
    section('Keyboard shortcuts', el('dl', {}, SHORTCUTS.flatMap(([keys, what]) => [
      el('dt', { textContent: keys }), el('dd', { textContent: what }),
    ]))),
    section('Globals by mode', ...GLOBALS.flatMap(([mode, lines]) => [el('h6', { textContent: mode }), list(lines)])),
  ])
  panel.replaceChildren(box)

  box.addEventListener('click', e => {
    const button = e.target.closest('[data-template]')
    if (!button) return
    close()
    onTemplate(button.dataset.template)
  })
  panel.addEventListener('click', e => { if (e.target === panel) close() })
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close() })

  return {
    open, close,
    toggle: () => (panel.hidden ? open() : close()),
    get isOpen() { return !panel.hidden },
  }
}
