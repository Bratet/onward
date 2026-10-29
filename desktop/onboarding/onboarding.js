// The first-launch setup. window.onboarding comes from preload.cjs.
// Two doors: start fresh (name and folder, then the app opens on /welcome for the resume),
// or open an existing Onward folder. The AI tools screen appears only when something is missing.
// The window stays open on "Getting Onward ready" until the app's own window replaces it.
const api = window.onboarding
const state = { step: 'start', door: null, folder: null, existing: null, tools: null, checking: null, confirmed: false }

const $ = (selector) => document.querySelector(selector)
// The stylesheet draws a title bar only where the window has no system one.
document.documentElement.classList.add(`platform-${api.platform}`)

/** Which stage of the rail each screen belongs to. */
const STAGE = { start: 'welcome', setup: 'folder', tools: 'tools', launch: 'resume' }
const STAGES = ['welcome', 'folder', 'tools', 'resume']

function show(step) {
  state.step = step
  for (const section of document.querySelectorAll('section')) section.classList.toggle('active', section.dataset.step === step)
  renderRail()
  const section = $(`section[data-step="${step}"]`)
  const focus = step === 'setup' ? $('#full-name') : section.querySelector('.door, .primary')
  focus?.focus({ preventScroll: true })
}

function back() {
  if (state.step === 'tools' && state.door === 'fresh') return show('setup')
  show('start')
}

/** The rail: where you are, what is done, and a short note under each stage. */
function renderRail() {
  const at = STAGES.indexOf(STAGE[state.step])
  const notes = {
    welcome: state.door === 'fresh' ? 'Starting fresh' : state.door === 'existing' ? 'Opening your folder' : '',
    folder: folderNote(),
    tools: toolsNote(),
    resume: state.door === 'existing' ? '' : 'Next, in Onward',
  }
  for (const item of document.querySelectorAll('.journey li')) {
    const stage = item.dataset.stage
    const index = STAGES.indexOf(stage)
    const done = index < at || (stage === 'folder' && state.door === 'existing') || (stage === 'tools' && toolsReady(state.tools ?? {}))
    const attention = stage === 'tools' && state.tools && !toolsReady(state.tools)
    item.className = index === at ? 'current' : done ? 'done' : attention ? 'attention' : ''
    if (index === at) item.setAttribute('aria-current', 'step')
    else item.removeAttribute('aria-current')
    item.querySelector('.stage-note').textContent = notes[stage]
  }
  $('.journey li[data-stage="resume"] .stage-name').textContent = state.door === 'existing' ? 'Open Onward' : 'Your resume'
}

/** The last two parts of a path, which say enough in a narrow rail. */
function shortPath(path) {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : path
}

function folderNote() {
  if (state.door === 'existing' && state.existing) return shortPath(state.existing.path)
  if (state.door === 'fresh' && state.confirmed && state.folder) return shortPath(state.folder.path)
  return ''
}

function toolsNote() {
  const tools = state.tools
  if (!tools) return state.checking ? 'Checking…' : ''
  if (!toolsReady(tools)) return 'Needs setup'
  return tools.claude ? 'Claude Code ready' : 'Codex ready'
}

function renderFolder() {
  const { path, kind } = state.folder
  $('#folder-path').textContent = path
  const note = $('#folder-note')
  note.textContent = kind === 'existing'
    ? 'This folder already has Onward data. Onward will open it as it is.'
    : 'Onward will create this folder. Your Documents folder is easy to find and back up.'
  note.classList.toggle('existing', kind === 'existing')
  // An existing folder keeps what it has; the outline is for a new one.
  $('#folder-tree').hidden = kind === 'existing'
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
    renderRail()
    try {
      state.tools = await api.checkTools()
    } catch {
      state.tools = { claude: null, codex: null, rendercv: null }
    } finally {
      state.checking = null
      $('#recheck').disabled = false
    }
    renderTools()
    renderRail()
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
  $('#tools-next').classList.toggle('secondary', !ai)
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

/** Saves the choice, then waits on "Getting Onward ready" until the app's window takes over and closes this one. */
async function finish(errorTarget) {
  errorTarget.textContent = ''
  const existing = state.door === 'existing' || state.folder.kind === 'existing'
  const folder = state.door === 'existing' ? state.existing : state.folder
  try {
    await api.finish({ folder: folder.path, fullName: $('#full-name').value })
  } catch (err) {
    errorTarget.textContent = `Couldn't set up the folder: ${String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`
    return
  }
  $('#launch-title').textContent = existing ? 'Opening your folder' : 'Getting Onward ready'
  $('#launch-lead').textContent = existing ? 'Everything is where you left it.' : 'Your resume comes next, in Onward itself.'
  $('#launch-folder').textContent = existing ? 'Folder found' : 'Folder created'
  $('#launch-path').textContent = folder.path
  show('launch')
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
  renderRail()
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
    $('#full-name').setAttribute('aria-invalid', 'true')
    $('#full-name').focus()
    return
  }
  $('#name-error').textContent = ''
  $('#full-name').removeAttribute('aria-invalid')
  state.confirmed = true
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
