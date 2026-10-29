// Renders resources/dmg/background.html into the macOS installer window's background:
// a 1x and a 2x screenshot from headless Chrome, joined into background.tiff so Finder
// shows the sharp one on a Retina screen. macOS only (tiffutil). Run from desktop/:
//   npm run dmg-background        (CHROME=/path/to/chrome to use another Chromium)
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'dmg')
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const page = pathToFileURL(join(dir, 'background.html')).href
const scratch = mkdtempSync(join(tmpdir(), 'onward-dmg-'))

const shots = [1, 2].map((scale) => {
  const file = join(scratch, `background-${scale}x.png`)
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--force-device-scale-factor=${scale}`,
    '--window-size=540,380',
    // Give the serif time to load before the capture.
    '--virtual-time-budget=2000',
    `--user-data-dir=${join(scratch, 'profile')}`,
    `--screenshot=${file}`,
    page,
  ], { stdio: 'ignore' })
  return file
})

const out = join(dir, 'background.tiff')
execFileSync('tiffutil', ['-cathidpicheck', ...shots, '-out', out])
rmSync(scratch, { recursive: true, force: true })
console.log(`wrote ${out}`)
