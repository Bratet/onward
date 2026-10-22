import { spawnSync } from 'child_process'
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

function works(bin, args, env) {
  const result = spawnSync(bin, args, {
    env,
    encoding: 'utf-8',
    timeout: 15000,
    // npm installs `claude` and `codex` as .cmd shims on Windows, which only a shell can run.
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  return result.status === 0
}

/** Which of the tools the app shells out to are reachable with this environment. */
export function detectEngines(env) {
  const python = process.platform === 'win32' ? 'python' : 'python3'
  return {
    claude: works('claude', ['--version'], env),
    codex: works('codex', ['--version'], env),
    rendercv: works('rendercv', ['--version'], env) || works(python, ['-m', 'rendercv', '--version'], env),
  }
}

export const INSTALL_LINKS = {
  claude: 'https://claude.com/claude-code',
  codex: 'https://github.com/openai/codex',
  rendercv: 'https://docs.rendercv.com',
}
