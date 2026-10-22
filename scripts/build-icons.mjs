// Builds every app icon from the one mark in src/app/icon.svg: the browser
// favicon and Apple touch icon, and the desktop app's macOS, Windows and Linux
// icons. Run after changing the mark: node scripts/build-icons.mjs
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = readFileSync(join(root, 'src/app/icon.svg'), 'utf-8')
const resources = join(root, 'desktop/resources')
mkdirSync(resources, { recursive: true })

const gradient = source.match(/<defs>[\s\S]*<\/defs>/)[0]
const mark = source.match(/<path[^>]*\/>/)[0]

/** The mark on a 64-unit tile, placed in a canvas; `rx` 0 gives a square tile for platforms that round it themselves. */
function svg({ canvas = 64, inset = 0, rx = 15, shadow = false }) {
  const size = canvas - inset * 2
  const scale = size / 64
  const filter = shadow
    ? '<filter id="shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="0.8" stdDeviation="1.1" flood-color="#1c0d3d" flood-opacity="0.3"/></filter>'
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}">${gradient.replace('</defs>', `${filter}</defs>`)}
    <g transform="translate(${inset} ${inset}) scale(${scale})">
      <rect width="64" height="64" rx="${rx}" fill="url(#onward-tile)"${shadow ? ' filter="url(#shadow)"' : ''}/>${mark}
    </g></svg>`
}

const png = (markup, size) => sharp(Buffer.from(markup), { density: 72 * 8 }).resize(size, size).png().toBuffer()

/** An .ico holding PNG images, which every Windows version since Vista reads. */
async function ico(markup, sizes) {
  const images = await Promise.all(sizes.map((size) => png(markup, size)))
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(images[i].length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += images[i].length
  })
  return Buffer.concat([header, ...images])
}

// Browser: favicon.ico for browsers that ignore icon.svg; iOS rounds its own corners.
writeFileSync(join(root, 'src/app/favicon.ico'), await ico(svg({}), [16, 32, 48]))
writeFileSync(join(root, 'src/app/apple-icon.png'), await png(svg({ rx: 0 }), 180))

// macOS: Apple's icon grid, an 824 px body with a soft shadow in a 1024 px canvas.
const macOS = svg({ canvas: 1024, inset: 100, rx: 15, shadow: true })
const iconset = join(mkdtempSync(join(tmpdir(), 'onward-icons-')), 'icon.iconset')
mkdirSync(iconset)
for (const size of [16, 32, 128, 256, 512]) {
  writeFileSync(join(iconset, `icon_${size}x${size}.png`), await png(macOS, size))
  writeFileSync(join(iconset, `icon_${size}x${size}@2x.png`), await png(macOS, size * 2))
}
if (process.platform === 'darwin') {
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(resources, 'icon.icns')])
} else {
  console.warn('iconutil needs macOS: desktop/resources/icon.icns was left as it is')
}
rmSync(join(iconset, '..'), { recursive: true, force: true })

// Windows and Linux show the tile as it is, with a little room around it on Linux.
writeFileSync(join(resources, 'icon.ico'), await ico(svg({}), [16, 24, 32, 48, 64, 128, 256]))
writeFileSync(join(resources, 'icon.png'), await png(svg({ canvas: 512, inset: 24 }), 512))

console.log('icons written')
