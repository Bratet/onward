import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { delimiter } from 'node:path'
import { PATHS } from '../src/lib/paths'

// Runs rendercv's Markdown-to-Typst conversion with patches/ on PYTHONPATH, exactly as
// src/lib/render.ts spawns it, so these cases check the patched behaviour that ships.
function toTypst(markdown: string): string {
  const code = 'import sys; from rendercv.renderer.templater.markdown_parser import markdown_to_typst as m; ' +
    'sys.stdout.buffer.write(m(sys.stdin.read()).encode())'
  return execFileSync('python3', ['-c', code], {
    input: markdown,
    encoding: 'utf-8',
    env: {
      ...process.env,
      PYTHONPATH: [PATHS.patches, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
      PYTHONIOENCODING: 'utf-8',
    },
  })
}

// Typst reads ";" right after a #command as the end of the expression, so it vanished from
// "**93% accuracy**; deployed" on the general resume (2026-10-12). The patch escapes it.
assert.equal(toTypst('at **93% accuracy**; deployed'), 'at #strong[93\\% accuracy]\\; deployed')
assert.equal(toTypst('an *aside*; then more'), 'an #emph[aside]\\; then more')
assert.equal(toTypst('[paper](https://example.org); presented'), '#link("https://example.org")[paper]\\; presented')

// A semicolon anywhere else is ordinary text and stays unescaped.
assert.equal(toTypst('plain; text'), 'plain; text')
assert.equal(toTypst('**bold** then; later'), '#strong[bold] then; later')

// The older fix in the same patch: a nested sub-bullet keeps its indentation.
assert.equal(toTypst('Main point\n  - **sub** point'), 'Main point\n  - #strong[sub] point')

console.log('Render markup: semicolons after bold, italic and links, plain semicolons, and nested bullets pass')
