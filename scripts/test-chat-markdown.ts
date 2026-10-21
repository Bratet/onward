import { parseChatMarkdown, parseInline } from '../src/lib/chatMarkdown'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const json = (value: unknown) => JSON.stringify(value)

console.log('chat markdown')

const bold = parseInline('It now reads: **"AI/ML Engineer"**. Done.')
check('bold becomes a strong node', json(bold) === json([
  { type: 'text', text: 'It now reads: ' },
  { type: 'strong', children: [{ type: 'text', text: '"AI/ML Engineer"' }] },
  { type: 'text', text: '. Done.' },
]), json(bold))

const code = parseInline('Edit `cv.yaml` and keep **`summary`** short')
check('inline code is kept literal', code[1]?.type === 'code' && code[1].text === 'cv.yaml', json(code))
check('code nests inside bold', json(code[3]) === json({ type: 'strong', children: [{ type: 'code', text: 'summary' }] }), json(code[3]))

check('stars inside code stay literal', json(parseInline('`a * b * c`')) === json([{ type: 'code', text: 'a * b * c' }]))
check('italic with single stars', parseInline('a *real* claim')[1]?.type === 'em')
check('a lone star is text', json(parseInline('5 * 3 = 15')) === json([{ type: 'text', text: '5 * 3 = 15' }]))
check('snake_case is not italic', json(parseInline('use profile_fit_report')) === json([{ type: 'text', text: 'use profile_fit_report' }]))

const link = parseInline('See [the run](https://example.com/runs/1).')
check('http links become link nodes', link[1]?.type === 'link' && link[1].href === 'https://example.com/runs/1', json(link))
check('non-http links stay text', parseInline('[x](javascript:alert(1))').every((node) => node.type === 'text'))

const blocks = parseChatMarkdown([
  '## Fit',
  'First line',
  'second line',
  '',
  '- one',
  '- **two**',
  '  continued',
  '',
  '1. first',
  '2. second',
  '',
  '> quoted',
  '',
  '```yaml',
  'name: **not bold**',
  '```',
].join('\n'))
check('block kinds in order', json(blocks.map((block) => block.type)) === json(['heading', 'paragraph', 'list', 'list', 'quote', 'code']), json(blocks.map((block) => block.type)))
check('paragraph keeps its line break', blocks[1]?.type === 'paragraph' && json(blocks[1].children) === json([{ type: 'text', text: 'First line\nsecond line' }]))
check('indented line continues the list item', blocks[2]?.type === 'list' && blocks[2].items.length === 2 && json(blocks[2].items[1]).includes('continued'))
check('numbered list is ordered and starts at 1', blocks[3]?.type === 'list' && blocks[3].ordered && blocks[3].start === 1)
check('fenced code is not parsed', blocks[5]?.type === 'code' && blocks[5].text === 'name: **not bold**')

const unclosed = parseChatMarkdown('```\nhalf a block')
check('an unclosed fence still renders its body', unclosed[0]?.type === 'code' && unclosed[0].text === 'half a block')
check('plain text is one paragraph', json(parseChatMarkdown('Mid-level: 2 to 5 years.')) === json([{ type: 'paragraph', children: [{ type: 'text', text: 'Mid-level: 2 to 5 years.' }] }]))
check('empty input has no blocks', parseChatMarkdown('  \n\n').length === 0)

if (failures) {
  console.log(`\n${failures} chat markdown check(s) failed`)
  process.exit(1)
}
console.log('all chat markdown checks passed')
