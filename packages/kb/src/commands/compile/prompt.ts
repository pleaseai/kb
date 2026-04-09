export interface PromptInput {
  topic: string
  /** Each raw source file: path (relative to KB root) + full text. */
  sources: Array<{ path: string, content: string }>
  /** Previously compiled article body (without frontmatter), if any. */
  existing?: string | null
  /** Slugs of other articles already in the KB, for the LLM to link against. */
  siblings?: string[]
}

export interface CompilePrompt {
  system: string
  user: string
}

const SYSTEM_PROMPT = `You are a technical knowledge base compiler.

Your job is to synthesize raw research notes into a single, well-structured wiki article in Markdown. Follow these rules strictly:

1. Output ONE article body in Markdown starting with a top-level heading (# Title).
2. Do NOT output YAML frontmatter — the caller handles that.
3. Resolve contradictions between sources by preferring more recent or more authoritative evidence. When uncertainty remains, say so in the article.
4. Structure the article with clear subsections (## Section). Keep the writing concise and technical.
5. Add a final "## Related" section with links to other articles using relative Markdown links of the form [Title](topic-slug.md). Only include links to articles that exist in the supplied KB siblings list. Omit the section if no related siblings apply.
6. Add a final "## References" section with external links extracted from the raw sources when present.
7. After the body, emit a special fenced block with the article's summary and tags on separate lines, like this:

\`\`\`kb-meta
summary: One-sentence summary of the article (under 140 characters).
tags: tag1, tag2, tag3
\`\`\`

The caller parses this block to populate frontmatter. Do not emit any other output after the block.`

function formatSources(sources: Array<{ path: string, content: string }>): string {
  return sources
    .map((src, i) => `<source index="${i}" path="${src.path}">\n${src.content}\n</source>`)
    .join('\n\n')
}

export function buildCompilePrompt(input: PromptInput): CompilePrompt {
  const userParts: string[] = []
  userParts.push(`Topic slug: ${input.topic}`)

  if (input.siblings && input.siblings.length > 0) {
    userParts.push('')
    userParts.push('Available sibling articles for Related links (use relative slug links):')
    for (const sibling of input.siblings)
      userParts.push(`- ${sibling}`)
  }

  if (input.existing && input.existing.trim().length > 0) {
    userParts.push('')
    userParts.push('Previously compiled article (rewrite or refine as needed based on new evidence):')
    userParts.push('<existing-article>')
    userParts.push(input.existing.trim())
    userParts.push('</existing-article>')
  }

  userParts.push('')
  userParts.push('Raw sources:')
  userParts.push(formatSources(input.sources))
  userParts.push('')
  userParts.push(
    'Produce the compiled article now. Remember: start with the top-level heading, end with the kb-meta fenced block.',
  )

  return { system: SYSTEM_PROMPT, user: userParts.join('\n') }
}

/**
 * Parse the article body emitted by the LLM into its constituent parts:
 *   - body: the markdown article (heading + sections), stripped of kb-meta
 *   - summary: one-liner for frontmatter
 *   - tags: comma-separated list lifted from kb-meta
 */
export interface ParsedArticle {
  body: string
  summary: string
  tags: string[]
}

const KB_META_RE = /```kb-meta\n([\s\S]*?)```/

function readFieldValue(meta: string, field: string): string | null {
  const prefix = `${field}:`
  for (const line of meta.split('\n')) {
    if (line.startsWith(prefix))
      return line.slice(prefix.length).trim()
  }
  return null
}

export function parseCompiledResponse(response: string): ParsedArticle {
  const metaMatch = response.match(KB_META_RE)
  if (!metaMatch) {
    throw new Error(
      'LLM response is missing the required ```kb-meta block. Retry with a stricter prompt.',
    )
  }

  const meta = metaMatch[1]
  const summary = readFieldValue(meta, 'summary')
  const tagsRaw = readFieldValue(meta, 'tags')

  if (summary === null || summary.length === 0)
    throw new Error('kb-meta block is missing `summary:` line.')

  const tags = tagsRaw
    ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    : []

  const body = response.slice(0, metaMatch.index).trimEnd()

  return { body, summary, tags }
}
