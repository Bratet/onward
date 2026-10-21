import type { ReactNode } from 'react'
import { parseChatMarkdown, type BlockNode, type InlineNode } from '@/lib/chatMarkdown'
import { cn } from '@/lib/utils'

/** An AI reply with its Markdown rendered as text, never as injected HTML. */
export function ChatMarkdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('space-y-2 break-words [text-wrap:pretty]', className)}>
      {parseChatMarkdown(text).map((block, index) => <Block key={index} block={block} />)}
    </div>
  )
}

function Block({ block }: { block: BlockNode }) {
  switch (block.type) {
    case 'heading':
      return <p className="pt-1 font-semibold">{inline(block.children)}</p>
    case 'quote':
      return <blockquote className="whitespace-pre-wrap border-l-2 border-[var(--color-border-strong)] pl-3 text-[var(--color-muted)]">{inline(block.children)}</blockquote>
    case 'code':
      return <pre className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 font-mono text-xs leading-relaxed">{block.text}</pre>
    case 'list': {
      const items = block.items.map((item, index) => <li key={index} className="whitespace-pre-wrap pl-1">{inline(item)}</li>)
      return block.ordered
        ? <ol start={block.start} className="list-decimal space-y-1 pl-5 marker:text-[var(--color-muted)]">{items}</ol>
        : <ul className="list-disc space-y-1 pl-5 marker:text-[var(--color-muted)]">{items}</ul>
    }
    default:
      return <p className="whitespace-pre-wrap">{inline(block.children)}</p>
  }
}

function inline(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'strong': return <strong key={index} className="font-semibold">{inline(node.children)}</strong>
      case 'em': return <em key={index}>{inline(node.children)}</em>
      case 'code': return <code key={index} className="rounded bg-[var(--color-bg)] px-1 py-0.5 font-mono text-[0.9em]">{node.text}</code>
      case 'link': return <a key={index} href={node.href} target="_blank" rel="noreferrer" className="text-[var(--color-accent)] underline underline-offset-2">{inline(node.children)}</a>
      default: return node.text
    }
  })
}
