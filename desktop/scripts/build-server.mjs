// Builds the Next app as a self-contained server and lays it out in
// desktop/build/server, the folder electron-builder ships as resources/server.
//
// The server runs with that folder as its cwd, so it must hold everything the
// app reads relative to its root: templates/, patches/, AGENTS.md, the pdf.js
// worker, and examples/workspace (copied as the sample data on first launch).
import { spawnSync } from 'child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(desktop, '..')
const out = join(desktop, 'build', 'server')
const distDir = join(root, '.next-desktop')

// A clean build every time: a reused cache can keep a stylesheet that misses new classes.
rmSync(distDir, { recursive: true, force: true })
const build = spawnSync('npx', ['next', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  // The build must never see the user's own data: prerendered pages would carry it.
  env: { ...process.env, ONWARD_STANDALONE: '1', ONWARD_WORKSPACE: 'examples/workspace' },
})
if (build.status !== 0) process.exit(build.status ?? 1)

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync(join(distDir, 'standalone'), out, { recursive: true })
cpSync(join(distDir, 'static'), join(out, '.next-desktop', 'static'), { recursive: true })
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), join(out, 'public'), { recursive: true })

const skipPyCache = (src) => !src.includes('__pycache__')
cpSync(join(root, 'templates'), join(out, 'templates'), { recursive: true })
cpSync(join(root, 'patches'), join(out, 'patches'), { recursive: true, filter: skipPyCache })
cpSync(join(root, 'AGENTS.md'), join(out, 'AGENTS.md'))
// Only the tracked sample: tests leave settings, runs and chats in it (see .gitignore).
const LOCAL_STATE = /[\\/]state[\\/](settings\.json|claude-models\.json|codex-models\.json|goal\.json|\.trash|runs|chats|workspaces)([\\/]|$)/
cpSync(join(root, 'examples', 'workspace'), join(out, 'examples', 'workspace'), {
  recursive: true,
  filter: (src) => !LOCAL_STATE.test(src),
})
const worker = join('node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs')
mkdirSync(dirname(join(out, worker)), { recursive: true })
cpSync(join(root, worker), join(out, worker))

// Releases are public: refuse to ship anything that looks like a real workspace.
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? [path, ...walk(path)] : [path]
  })
}
const leaked = walk(out)
  .map((path) => relative(out, path))
  .filter((path) => /^workspace([\\/]|$)/.test(path) || /^tmp([\\/]|$)/.test(path))
if (leaked.length) {
  console.error(`refusing to ship personal data:\n  ${leaked.slice(0, 10).join('\n  ')}`)
  process.exit(1)
}
console.log(`server ready in ${relative(root, out)}`)
