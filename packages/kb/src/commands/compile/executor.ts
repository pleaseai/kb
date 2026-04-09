import type { WriteWikiResult } from './writer'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'pathe'
import { chunk } from '../../core/chunkers'
import { hashTopicDir } from '../../core/hash'
import { buildCompilePrompt, parseCompiledResponse } from './prompt'
import { writeWikiArticle } from './writer'

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/
const MD_EXT_RE = /\.md$/
const WORD_RE = /\S+/g

/**
 * Minimal LLM client contract. Keeping this abstract means:
 *   - Tests inject a deterministic stub
 *   - Future Anthropic SDK wiring lives in a single adapter module
 *   - Users can bring their own LLM without touching the executor
 */
export interface LlmClient {
  complete: (prompt: { system: string, user: string }) => Promise<string>
}

export interface CompileExecutorOptions {
  rootDir: string
  /** Topics to compile. Caller (runCompile) passes `added + modified`. */
  topics: string[]
  /** LLM client. Required for non-dry-run execution. */
  llm: LlmClient
  /** Token budget per chunk batch. Defaults to 8000 words. */
  chunkWordBudget?: number
  /** Injectable clock for deterministic tests. */
  now?: () => Date
}

export interface CompileTaskResult {
  topic: string
  status: 'compiled' | 'skipped' | 'error'
  path?: string
  sourceHash?: string
  title?: string
  summary?: string
  tags?: string[]
  error?: string
}

async function loadRawSources(
  rootDir: string,
  topic: string,
): Promise<Array<{ path: string, content: string }>> {
  const topicDir = join(rootDir, 'raw', topic)
  const entries = await readdir(topicDir, { withFileTypes: true })
  const files = entries
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => e.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  const out: Array<{ path: string, content: string }> = []
  for (const name of files) {
    const full = join(topicDir, name)
    const content = await readFile(full, 'utf8')
    out.push({ path: relative(rootDir, full), content })
  }
  return out
}

async function loadExistingArticle(
  rootDir: string,
  topic: string,
): Promise<string | null> {
  const path = join(rootDir, 'wiki', `${topic}.md`)
  try {
    const raw = await readFile(path, 'utf8')
    // Strip frontmatter so the LLM only sees the body
    const match = raw.match(FRONTMATTER_RE)
    return match ? raw.slice(match[0].length) : raw
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return null
    throw error
  }
}

async function listSiblings(rootDir: string, currentTopic: string): Promise<string[]> {
  const wikiDir = join(rootDir, 'wiki')
  try {
    const entries = await readdir(wikiDir, { withFileTypes: true })
    return entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => e.name.replace(MD_EXT_RE, ''))
      .filter(slug => slug !== currentTopic)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return []
    throw error
  }
}

/**
 * Assemble the LLM input for a single topic.
 *
 * When the concatenated raw source content exceeds `chunkWordBudget`, the
 * chunker is used to window the content and only the most recent chunks
 * are retained — a deliberately simple strategy for v1 that we can improve
 * later without changing the public executor contract.
 */
function windowSources(
  sources: Array<{ path: string, content: string }>,
  chunkWordBudget: number,
): Array<{ path: string, content: string }> {
  const totalWords = sources.reduce(
    (acc, s) => acc + (s.content.match(WORD_RE)?.length ?? 0),
    0,
  )
  if (totalWords <= chunkWordBudget)
    return sources

  // Budget exceeded: chunk each source and keep head chunks to preserve
  // intro context, which is usually where the most important framing lives.
  const perSourceBudget = Math.max(100, Math.floor(chunkWordBudget / sources.length))
  return sources.map((src) => {
    const chunks = chunk(src.content, { chunkSize: perSourceBudget, chunkOverlap: 0 })
    const kept = chunks.length > 0 ? chunks[0].text : src.content
    return { path: src.path, content: kept }
  })
}

export async function executeCompile(
  options: CompileExecutorOptions,
): Promise<CompileTaskResult[]> {
  const { rootDir, topics, llm } = options
  const chunkWordBudget = options.chunkWordBudget ?? 8000
  const now = options.now ?? (() => new Date())

  const results: CompileTaskResult[] = []

  for (const topic of topics) {
    try {
      const rawSources = await loadRawSources(rootDir, topic)
      if (rawSources.length === 0) {
        results.push({ topic, status: 'skipped', error: 'no raw sources' })
        continue
      }
      const windowed = windowSources(rawSources, chunkWordBudget)
      const existing = await loadExistingArticle(rootDir, topic)
      const siblings = await listSiblings(rootDir, topic)

      const prompt = buildCompilePrompt({
        topic,
        sources: windowed,
        existing,
        siblings,
      })
      const response = await llm.complete(prompt)
      const parsed = parseCompiledResponse(response)

      const topicDir = join(rootDir, 'raw', topic)
      const sourceHash = await hashTopicDir(topicDir)

      const written: WriteWikiResult = await writeWikiArticle({
        rootDir,
        topic,
        body: parsed.body,
        summary: parsed.summary,
        tags: parsed.tags,
        sources: rawSources.map(s => s.path),
        sourceHash,
        now,
      })

      results.push({
        topic,
        status: 'compiled',
        path: written.path,
        sourceHash,
        title: written.title,
        summary: parsed.summary,
        tags: parsed.tags,
      })
    }
    catch (error) {
      // Per-topic isolation: one topic failing must not abort the batch.
      results.push({
        topic,
        status: 'error',
        error: (error as Error).message,
      })
    }
  }

  return results
}
