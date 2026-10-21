/**
 * The small Markdown subset AI chat replies actually use, parsed into plain data
 * so the UI renders React nodes and never injects HTML.
 *
 * Supported: paragraphs, `-`/`*`/`•` and numbered lists, `#` headings, `>` quotes,
 * fenced code, and inline `code`, **bold**, *italic* and [links](https://…).
 * Anything else stays literal text.
 */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: InlineNode[] }

export type BlockNode =
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'heading'; children: InlineNode[] }
  | { type: 'quote'; children: InlineNode[] }
  | { type: 'list'; ordered: boolean; start: number; items: InlineNode[][] }
  | { type: 'code'; text: string }

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const FENCE = /^\s{0,3}(```|~~~)/

export function parseChatMarkdown(source: string): BlockNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: BlockNode[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; start: number; items: string[] } | null = null
  let quote: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) })
    paragraph = []
  }
  const flushList = () => {
    if (list) blocks.push({ type: 'list', ordered: list.ordered, start: list.start, items: list.items.map(parseInline) })
    list = null
  }
  const flushQuote = () => {
    if (quote.length) blocks.push({ type: 'quote', children: parseInline(quote.join('\n')) })
    quote = []
  }
  const flushAll = () => { flushParagraph(); flushList(); flushQuote() }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const fence = FENCE.exec(line)
    if (fence) {
      flushAll()
      const body: string[] = []
      index++
      while (index < lines.length && !lines[index].trimStart().startsWith(fence[1])) body.push(lines[index++])
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    if (!line.trim()) {
      flushAll()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flushAll()
      blocks.push({ type: 'heading', children: parseInline(heading[1]) })
      continue
    }
    const quoted = QUOTE.exec(line)
    if (quoted) {
      flushParagraph(); flushList()
      quote.push(quoted[1])
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if (bullet || numbered) {
      flushParagraph(); flushQuote()
      const ordered = Boolean(numbered)
      if (list && list.ordered !== ordered) flushList()
      if (!list) list = { ordered, start: numbered ? Number(numbered[1]) : 1, items: [] }
      list.items.push(bullet ? bullet[1] : numbered![2])
      continue
    }
    if (list && /^\s{2,}\S/.test(line)) {
      // An indented line continues the item above it.
      list.items[list.items.length - 1] += `\n${line.trim()}`
      continue
    }
    flushList(); flushQuote()
    paragraph.push(line)
  }
  flushAll()
  return blocks
}

const INLINE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*(?=\S)([\s\S]*?\S)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(?<![\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])/g

export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let last = 0
  for (const match of source.matchAll(INLINE)) {
    const at = match.index ?? 0
    if (at > last) pushText(nodes, source.slice(last, at))
    if (match[1]) nodes.push({ type: 'code', text: match[2] })
    else if (match[3] !== undefined) nodes.push({ type: 'strong', children: parseInline(match[3]) })
    else if (match[4] !== undefined) nodes.push({ type: 'link', href: match[5], children: parseInline(match[4]) })
    else nodes.push({ type: 'em', children: parseInline(match[6]) })
    last = at + match[0].length
  }
  if (last < source.length) pushText(nodes, source.slice(last))
  return nodes
}

function pushText(nodes: InlineNode[], text: string) {
  const previous = nodes.at(-1)
  if (previous?.type === 'text') previous.text += text
  else nodes.push({ type: 'text', text })
}
