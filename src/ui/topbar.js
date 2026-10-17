// Top bar (mode, runs in, on change, theme, font size, help) and the creation
// header (name, modified dot, Save, Fork, History, Share).
// `actions` holds the handlers; a missing one leaves its button disabled.

const RUN_MODE_LABELS = { worker: 'worker', page: 'full page' }

export function createTopbar({ session, editor, settings, saveSettings, actions = {} }) {
  const $ = id => document.getElementById(id)
  const modeSel = $('mode-select'), runSel = $('runmode-select'), onChangeSel = $('onchange-select')
  const themeSel = $('theme-select'), sizeSel = $('fontsize-select')
  const name = $('creation-name'), dot = $('modified-dot')
  const runTitle = runSel.title

  themeSel.value = settings.theme
  sizeSel.value = String(settings.fontSize)
  onChangeSel.value = settings.onChange

  const setSetting = (key, value) => {
    settings[key] = value
    saveSettings(settings)
  }
  themeSel.addEventListener('change', () => {
    setSetting('theme', themeSel.value)
    editor.setTheme(themeSel.value)
  })
  sizeSel.addEventListener('change', () => {
    setSetting('fontSize', Number(sizeSel.value))
    editor.setFontSize(settings.fontSize)
  })
  onChangeSel.addEventListener('change', () => setSetting('onChange', onChangeSel.value))
  modeSel.addEventListener('change', () => session.setMode(modeSel.value))
  runSel.addEventListener('change', () => session.setRunMode(runSel.value))

  name.addEventListener('change', () => {
    const value = name.value.trim()
    if (value) session.setName(value)
    else name.value = session.creation.name
  })
  name.addEventListener('keydown', e => {
    if (e.key === 'Enter') name.blur()
    if (e.key === 'Escape') { name.value = session.creation.name; name.blur() }
  })

  for (const [id, action] of [['btn-save', 'save'], ['btn-fork', 'fork'], ['btn-history', 'history'], ['btn-share', 'share'], ['btn-help', 'help']]) {
    const button = $(id)
    button.disabled = !actions[action]
    button.addEventListener('click', () => actions[action]?.())
  }

  // Reflects the session: selected and detected modes, name, modified dot.
  session.on('codeChanged', ({ modified }) => {
    modeSel.value = session.mode
    modeSel.options[0].textContent = `auto: ${session.concreteMode}`
    const forced = ['html', 'js', 'littlejs'].includes(session.concreteMode)
    runSel.value = forced ? 'page' : session.runModeSetting
    runSel.disabled = forced
    runSel.title = forced ? `${session.concreteMode} always runs in the full page` : runTitle
    runSel.options[0].textContent = `auto: ${RUN_MODE_LABELS[session.runMode]}`
    if (document.activeElement !== name) name.value = session.creation.name
    dot.hidden = !modified
  })
}
