import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'pathe'

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/
const QUOTE_RE = /"/g
const CREATED_DATE_RE = /(\d{4}-\d{2}-\d{2})/

export interface WriteWikiOptions {
  rootDir: string
  topic: string
  /** Markdown body with a top-level heading. */
  body: string
  summary: string
  tags: string[]
  sources: string[]
  sourceHash: string
  /** Injectable clock for deterministic tests. */
  now?: () => Date
  /** Override the parsed title; otherwise the first heading in `body` wins. */
  title?: string
}

export interface WriteWikiResult {
  path: string
  title: string
  created: string
  updated: string
}

function yamlEscape(value: string): string {
  return value.replace(QUOTE_RE, '\\"')
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildFrontmatter(fields: {
  title: string
  summary: string
  tags: string[]
  created: string
  updated: string
  sources: string[]
  sourceHash: string
}): string {
  const lines: string[] = ['---']
  lines.push(`title: "${yamlEscape(fields.title)}"`)
  lines.push(`summary: "${yamlEscape(fields.summary)}"`)
  if (fields.tags.length === 0) {
    lines.push('tags: []')
  }
  else {
    lines.push('tags:')
    for (const tag of fields.tags)
      lines.push(`  - ${tag}`)
  }
  lines.push(`created: "${fields.created}"`)
  lines.push(`updated: "${fields.updated}"`)
  if (fields.sources.length === 0) {
    lines.push('sources: []')
  }
  else {
    lines.push('sources:')
    for (const src of fields.sources)
      lines.push(`  - ${src}`)
  }
  lines.push(`sourceHash: "${fields.sourceHash}"`)
  lines.push('---')
  return lines.join('\n')
}

function extractFirstHeading(body: string): string | null {
  for (const line of body.split('\n')) {
    if (line.startsWith('# ')) {
      const title = line.slice(2).trim()
      if (title.length > 0)
        return title
    }
  }
  return null
}

/**
 * Read an existing wiki article and return its frontmatter `created` date,
 * or `null` if the file is missing or has no recognizable frontmatter.
 * Used to preserve the original creation date across recompiles.
 */
async function readExistingCreated(path: string): Promise<string | null> {
  if (!existsSync(path))
    return null
  const raw = await readFile(path, 'utf8')
  const front = raw.match(FRONTMATTER_RE)
  if (!front)
    return null
  for (const line of front[1].split('\n')) {
    if (line.startsWith('created:')) {
      const match = line.match(CREATED_DATE_RE)
      if (match)
        return match[1]
    }
  }
  return null
}

/**
 * Write (or overwrite) `wiki/<topic>.md` with the provided body and
 * frontmatter. When an article already exists its `created` date is
 * preserved; `updated` is always bumped to the current date.
 */
export async function writeWikiArticle(
  options: WriteWikiOptions,
): Promise<WriteWikiResult> {
  const { rootDir, topic, body, summary, tags, sources, sourceHash } = options
  const now = options.now ?? (() => new Date())

  const wikiDir = join(rootDir, 'wiki')
  await mkdir(wikiDir, { recursive: true })

  const path = join(wikiDir, `${topic}.md`)
  const title = options.title ?? extractFirstHeading(body) ?? topic

  const today = formatDate(now())
  const created = (await readExistingCreated(path)) ?? today
  const updated = today

  const frontmatter = buildFrontmatter({
    title,
    summary,
    tags,
    created,
    updated,
    sources,
    sourceHash,
  })

  const trimmedBody = body.trim()
  const content = `${frontmatter}\n\n${trimmedBody}\n`
  await writeFile(path, content, 'utf8')

  return { path, title, created, updated }
}
