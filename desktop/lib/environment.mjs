import { execFile, spawnSync } from 'child_process'
import { homedir } from 'os'
import { delimiter, join } from 'path'

/**
 * An app started from the Dock, Start menu or a launcher does not get the PATH
 * of the user's shell, so `claude`, `codex` and `rendercv` would look missing
 * even when they work in a terminal. Ask the login shell for its PATH and add
 * the folders their installers use.
 */
export function shellPath() {
  const home = homedir()
  const parts = []
  if (process.platform === 'win32') {
    if (process.env.APPDATA) parts.push(join(process.env.APPDATA, 'npm'))
    parts.push(join(home, '.local', 'bin'))
  } else {
    const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
    const probe = spawnSync(shell, ['-ilc', 'printf "__ONWARD_PATH__%s__ONWARD_PATH__" "$PATH"'], {
      encoding: 'utf-8',
      timeout: 8000,
    })
    const match = /__ONWARD_PATH__(.*)__ONWARD_PATH__/.exec(probe.stdout || '')
    if (match) parts.push(...match[1].split(delimiter))
    parts.push(
      join(home, '.local', 'bin'),
      join(home, '.claude', 'local'),
      join(home, '.npm-global', 'bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    )
  }
  parts.push(...(process.env.PATH || '').split(delimiter))
  return [...new Set(parts.filter(Boolean))].join(delimiter)
}

/** First line of `<bin> <args>`, or null when it isn't installed or fails. */
function version(bin, args, env) {
  return new Promise((resolve) => {
    execFile(bin, args, {
      env,
      timeout: 15000,
      // npm installs `claude` and `codex` as .cmd shims on Windows, which only a shell can run.
      shell: process.platform === 'win32',
      windowsHide: true,
    }, (err, stdout, stderr) => {
      resolve(err ? null : (String(stdout) || String(stderr)).trim().split('\n')[0] || 'installed')
    })
  })
}

/** The version of each tool the app shells out to, or null for one it can't reach. */
export async function detectEngines(env) {
  const python = process.platform === 'win32' ? 'python' : 'python3'
  const [claude, codex, rendercv] = await Promise.all([
    version('claude', ['--version'], env),
    version('codex', ['--version'], env),
    version('rendercv', ['--version'], env).then((found) => found ?? version(python, ['-m', 'rendercv', '--version'], env)),
  ])
  return { claude, codex, rendercv }
}

export const INSTALL_LINKS = {
  claude: 'https://claude.com/claude-code',
  codex: 'https://github.com/openai/codex',
  rendercv: 'https://docs.rendercv.com',
}
