// The first-launch setup. window.onboarding comes from preload.cjs.
// Two doors: start fresh (name and folder, then the app opens on /welcome for the resume),
// or open an existing Onward folder. The AI tools screen appears only when something is missing.
const api = window.onboarding
const state = { step: 'start', door: null, folder: null, existing: null, tools: null, checking: null }

const $ = (selector) => document.querySelector(selector)
// The stylesheet draws a title bar only where the window has no system one.
document.documentElement.classList.add(`platform-${api.platform}`)

function show(step) {
  state.step = step
  for (const section of document.querySelectorAll('section')) section.classList.toggle('active', section.dataset.step === step)
  const section = $(`section[data-step="${step}"]`)
  const focus = step === 'setup' ? $('#full-name') : section.querySelector('.door, .primary')
  focus?.focus()
}

function back() {
  if (state.step === 'tools' && state.door === 'fresh') return show('setup')
  show('start')
}

function renderFolder() {
  const { path, kind } = state.folder
  $('#folder-path').textContent = path
  const note = $('#folder-note')
  note.textContent = kind === 'existing'
    ? 'This folder already has Onward data. Onward will open it as it is.'
    : 'Onward will create this folder. Your Documents folder is easy to find and back up.'
  note.classList.toggle('existing', kind === 'existing')
}

const TOOL_TEXT = {
  claude: { missing: 'Not found' },
  codex: { missing: 'Not found' },
  rendercv: { missing: 'Not found. Needed to make PDFs: pip install "rendercv>=2.8"' },
}

/** Starts a check, or joins the one already running. */
function checkTools() {
  state.checking ??= (async () => {
    $('#recheck').disabled = true
    for (const item of document.querySelectorAll('.tools li')) {
      item.className = ''
      item.querySelector('.status').textContent = 'Checking…'
    }
    try {
      state.tools = await api.checkTools()
    } catch {
      state.tools = { claude: null, codex: null, rendercv: null }
    } finally {
      state.checking = null
      $('#recheck').disabled = false
    }
    renderTools()
    return state.tools
  })()
  return state.checking
}

function renderTools() {
  const tools = state.tools
  for (const [tool, version] of Object.entries(tools)) {
    const item = $(`.tools li[data-tool="${tool}"]`)
    const optional = tool !== 'rendercv' && (tools.claude || tools.codex)
    item.className = version ? 'ok' : optional ? 'optional-missing' : 'missing'
    item.querySelector('.status').textContent = version ? `Ready · ${version}` : optional ? 'Not found (optional, you have the other one)' : TOOL_TEXT[tool].missing
  }
  const ai = Boolean(tools.claude || tools.codex)
  $('#tools-next').textContent = ai ? 'Continue' : 'Continue without AI'
  $('#tools-next').classList.toggle('primary', ai)
  $('#tools-hint').hidden = ai
}

/** Every tool found: nothing to ask, so the tools screen is skipped. */
function toolsReady(tools) {
  return Boolean((tools.claude || tools.codex) && tools.rendercv)
}

/** After a door is chosen: the tools screen if something is missing, otherwise straight into Onward. */
async function proceed(button, errorTarget) {
  button.disabled = true
  try {
    const tools = state.tools ?? await checkTools()
    if (!toolsReady(tools)) return show('tools')
    await finish(errorTarget)
  } finally {
    button.disabled = false
  }
}

/** Saves the choice; closing the window hands over to the app. */
async function finish(errorTarget) {
  errorTarget.textContent = ''
  const folder = state.door === 'existing' ? state.existing : state.folder
  try {
    await api.finish({ folder: folder.path, fullName: $('#full-name').value })
  } catch (err) {
    errorTarget.textContent = `Couldn't set up the folder: ${String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`
    return
  }
  window.close()
}

$('#start-fresh').addEventListener('click', () => {
  state.door = 'fresh'
  $('#start-error').textContent = ''
  show('setup')
})

$('#open-existing').addEventListener('click', async () => {
  $('#start-error').textContent = ''
  const folder = await api.pickFolder('existing')
  if (!folder) return
  if (folder.kind !== 'existing') {
    $('#start-error').textContent = 'That folder has no Onward data in it. Choose the folder that holds resumes and state, or start fresh.'
    return
  }
  state.door = 'existing'
  state.existing = folder
  await proceed($('#open-existing'), $('#start-error'))
})

$('#change-folder').addEventListener('click', async () => {
  const folder = await api.pickFolder('new')
  if (!folder) return
  state.folder = folder
  renderFolder()
})

$('#setup-form').addEventListener('submit', (event) => { event.preventDefault(); $('#setup-next').click() })
$('#setup-next').addEventListener('click', () => {
  const name = $('#full-name').value.trim()
  // A folder that already holds Onward data opens as it is and keeps its own name.
  if (!name && state.folder.kind !== 'existing') {
    $('#name-error').textContent = 'Enter your name as it should appear on your resume.'
    $('#full-name').focus()
    return
  }
  $('#name-error').textContent = ''
  void proceed($('#setup-next'), $('#setup-error'))
})

for (const button of document.querySelectorAll('[data-back]')) button.addEventListener('click', back)
for (const button of document.querySelectorAll('[data-install]')) button.addEventListener('click', () => api.openLink(button.dataset.install))
$('#recheck').addEventListener('click', () => void checkTools())
// Someone sent off to install a CLI comes back to this window; check again without being asked.
window.addEventListener('focus', () => {
  if (state.step === 'tools' && !state.checking && !toolsReady(state.tools ?? {})) void checkTools()
})
$('#tools-next').addEventListener('click', async () => {
  $('#tools-next').disabled = true
  await finish($('#tools-error'))
  $('#tools-next').disabled = false
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

api.defaults().then(({ folder, fullName }) => {
  state.folder = folder
  renderFolder()
  if (fullName && !$('#full-name').value) $('#full-name').value = fullName
})
// The check takes a moment; by the time a door is chosen it has usually finished.
void checkTools()
show('start')
