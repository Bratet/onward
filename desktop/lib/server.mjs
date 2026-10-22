import { spawn } from 'child_process'
import { createWriteStream, mkdirSync } from 'fs'
import { get } from 'http'
import { createServer } from 'net'
import { dirname, join } from 'path'

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

function answers(url) {
  return new Promise((resolve) => {
    const req = get(url, (res) => { res.resume(); resolve(true) })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => { req.destroy(); resolve(false) })
  })
}

/**
 * Runs the bundled Next server with Electron's own Node, so the user needs no
 * Node install. Its cwd is the server folder: the app treats cwd as its root.
 */
export async function startServer({ serverDir, workspace, path, logFile }) {
  const port = await freePort()
  mkdirSync(dirname(logFile), { recursive: true })
  const log = createWriteStream(logFile, { flags: 'w' })
  const child = spawn(process.execPath, [join(serverDir, 'server.js')], {
    cwd: serverDir,
    env: {
      ...process.env,
      PATH: path,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      ONWARD_WORKSPACE: workspace,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout.pipe(log)
  child.stderr.pipe(log)

  let exited = null
  child.once('exit', (code) => { exited = code ?? -1 })

  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`the server stopped during startup (exit code ${exited})`)
    if (await answers(url)) return { url, stop: () => child.kill() }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  child.kill()
  throw new Error('the server did not answer within a minute')
}
