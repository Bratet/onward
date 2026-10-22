// The first-launch walkthrough. window.onboarding comes from preload.cjs.
const api = window.onboarding
const STEPS = ['welcome', 'folder', 'about', 'tools', 'done']
const state = { step: 'welcome', folder: null, tools: null }

const $ = (selector) => document.querySelector(selector)

/** "About you" only applies to a new folder: an existing one already knows who it belongs to. */
function skipped(step) {
  return step === 'about' && state.folder?.kind === 'existing'
}

function show(step) {
  state.step = step
  const index = STEPS.indexOf(step)
  for (const section of document.querySelectorAll('section')) section.classList.toggle('active', section.dataset.step === step)
  for (const item of document.querySelectorAll('.progress li')) {
    const at = STEPS.indexOf(item.dataset.step)
    item.className = skipped(item.dataset.step) ? 'skipped' : at < index ? 'done' : at === index ? 'current' : ''
    if (at === index) item.setAttribute('aria-current', 'step')
    else item.removeAttribute('aria-current')
  }
  const focus = document.querySelector(`section[data-step="${step}"] input, section[data-step="${step}"] .primary`)
  focus?.focus()
  if (step === 'tools' && !state.tools) void checkTools()
}

function move(direction) {
  let index = STEPS.indexOf(state.step) + direction
  while (skipped(STEPS[index])) index += direction
  show(STEPS[index])
}

function renderFolder() {
  const { path, kind } = state.folder
  $('#folder-path').textContent = path
  const note = $('#folder-note')
  note.textContent = kind === 'existing'
    ? 'This folder already has Onward data. Onward will open it as it is.'
    : 'Onward will create this folder and set it up for you.'
  note.classList.toggle('existing', kind === 'existing')
}

async function pick(purpose) {
  const folder = await api.pickFolder(purpose)
  if (!folder) return
  state.folder = folder
  renderFolder()
}

const TOOL_TEXT = {
  claude: { missing: 'Not found' },
  codex: { missing: 'Not found' },
  rendercv: { missing: 'Not found. Needed to make PDFs: pip install "rendercv>=2.8"' },
}

async function checkTools() {
  $('#recheck').disabled = true
  for (const item of document.querySelectorAll('.tools li')) {
    item.className = ''
    item.querySelector('.status').textContent = 'Checking…'
  }
  state.tools = await api.checkTools()
  for (const [tool, version] of Object.entries(state.tools)) {
    const item = document.querySelector(`.tools li[data-tool="${tool}"]`)
    const optional = tool !== 'rendercv' && (state.tools.claude || state.tools.codex)
    item.className = version ? 'ok' : optional ? 'optional-missing' : 'missing'
    item.querySelector('.status').textContent = version ? `Ready · ${version}` : optional ? 'Not found (optional, you have the other one)' : TOOL_TEXT[tool].missing
  }
  const ready = Boolean(state.tools.claude || state.tools.codex)
  $('#tools-next').textContent = ready ? 'Continue' : 'Continue anyway'
  $('#tools-next').classList.toggle('primary', ready)
  $('#tools-hint').hidden = ready
  $('#recheck').disabled = false
}

async function finish() {
  $('#finish-error').textContent = ''
  $('#tools-next').disabled = true
  try {
    await api.finish({ folder: state.folder.path, fullName: $('#full-name').value })
  } catch (err) {
    $('#finish-error').textContent = `Couldn't set up the folder: ${String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`
    $('#tools-next').disabled = false
    return
  }
  if (state.folder.kind === 'existing') {
    $('#done-title').textContent = 'Welcome back'
    $('#done-lead').textContent = 'Onward will open your existing folder, just as you left it.'
    $('#next-steps').hidden = true
    $('#open-app').textContent = 'Open Onward'
    document.querySelector('.progress li[data-step="done"]').textContent = 'Ready'
  }
  show('done')
}

for (const button of document.querySelectorAll('[data-next]')) button.addEventListener('click', () => move(1))
for (const button of document.querySelectorAll('[data-back]')) button.addEventListener('click', () => move(-1))
for (const button of document.querySelectorAll('[data-install]')) button.addEventListener('click', () => api.openLink(button.dataset.install))
$('#change-folder').addEventListener('click', () => pick('new'))
$('#existing-folder').addEventListener('click', async () => {
  await pick('existing')
  if (state.folder?.kind === 'existing') move(1)
})
$('#about-form').addEventListener('submit', (event) => { event.preventDefault(); $('#about-next').click() })
$('#about-next').addEventListener('click', () => {
  const name = $('#full-name').value.trim()
  if (!name) return void ($('#about-error').textContent = 'Please enter your name.')
  $('#about-error').textContent = ''
  move(1)
})
$('#recheck').addEventListener('click', () => void checkTools())
// Someone sent off to install a CLI comes back to this window; check again without being asked.
window.addEventListener('focus', () => {
  if (state.step === 'tools' && !$('#recheck').disabled && !(state.tools?.claude || state.tools?.codex)) void checkTools()
})
for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(button.dataset.copy)
    button.textContent = 'Copied'
    setTimeout(() => (button.textContent = 'Copy'), 1500)
  })
}
const TERMINAL = { darwin: 'Terminal (in Applications › Utilities)', win32: 'PowerShell (from the Start menu)' }
for (const span of document.querySelectorAll('[data-terminal]')) span.textContent = TERMINAL[api.platform] ?? 'a terminal'
$('#tools-next').addEventListener('click', () => void finish())
$('#open-app').addEventListener('click', () => window.close())

api.defaults().then((folder) => {
  state.folder = folder
  renderFolder()
})
show('welcome')
