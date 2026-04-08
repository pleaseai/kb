import type { Graph } from '../../graph'
import type { StatusReport } from './types'
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'pathe'
import { loadGraph } from '../../graph'

const HASH_LINE_RE = /^sourceHash:\s*"?([a-f0-9]{64})"?\s*$/m

async function listDir(dir: string): Promise<string[]> {
  if (!existsSync(dir))
    return []
  return readdir(dir)
}

/**
 * Walk `<kbRoot>/raw/` and return:
 * - topics:  immediate subdirectory names (one per topic)
 * - sources: every `.md` file under those topics, with its recorded sourceHash
 *            (parsed from the YAML frontmatter; null if missing).
 */
export async function walkRaw(kbRoot: string): Promise<{
  topics: string[]
  sources: Array<{ path: string, sourceHash: string | null }>
}> {
  const rawDir = join(kbRoot, 'raw')
  const topics: string[] = []
  const sources: Array<{ path: string, sourceHash: string | null }> = []

  for (const entry of await listDir(rawDir)) {
    const topicDir = join(rawDir, entry)
    const st = await stat(topicDir).catch(() => null)
    if (!st?.isDirectory())
      continue
    topics.push(entry)
    for (const file of await listDir(topicDir)) {
      if (!file.endsWith('.md'))
        continue
      const full = join(topicDir, file)
      const text = await readFile(full, 'utf8')
      const match = text.match(HASH_LINE_RE)
      sources.push({ path: full, sourceHash: match ? match[1] : null })
    }
  }

  topics.sort()
  return { topics, sources }
}

/**
 * Walk `<kbRoot>/wiki/` recursively and return every `.md` file as a path
 * relative to `kbRoot` (e.g. `wiki/auth/login.md`). Used for orphan detection.
 */
export async function walkWiki(kbRoot: string): Promise<string[]> {
  const wikiDir = join(kbRoot, 'wiki')
  const found: string[] = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await listDir(dir)) {
      const full = join(dir, entry)
      const st = await stat(full).catch(() => null)
      if (!st)
        continue
      if (st.isDirectory()) {
        await walk(full)
      }
      else if (entry.endsWith('.md')) {
        found.push(relative(kbRoot, full))
      }
    }
  }

  await walk(wikiDir)
  found.sort()
  return found
}

/**
 * An article is stale when its graph-recorded `sourceHash` is no longer
 * present among any current raw source's hash — i.e. the source on disk
 * has been re-ingested (new hash) or removed since the article was compiled.
 */
export function detectStale(
  graph: Graph,
  rawHashes: ReadonlySet<string>,
): StatusReport['stale'] {
  const stale: StatusReport['stale'] = []
  for (const [articleId, node] of Object.entries(graph.nodes.articles)) {
    const recorded = node.metadata.sourceHash
    if (!recorded || rawHashes.has(recorded))
      continue
    stale.push({
      articleId,
      path: node.metadata.path,
      recordedHash: recorded,
    })
  }
  stale.sort((a, b) => a.articleId.localeCompare(b.articleId))
  return stale
}

/**
 * A wiki file is orphaned when it lives on disk but no graph article points
 * at it via `metadata.path`. Path comparison is normalized to forward slashes
 * relative to `kbRoot`.
 */
export function detectOrphans(
  wikiFiles: readonly string[],
  graph: Graph,
): string[] {
  const known = new Set<string>()
  for (const node of Object.values(graph.nodes.articles)) {
    known.add(node.metadata.path.replace(/\\/g, '/'))
  }
  const orphans = wikiFiles
    .map(f => f.replace(/\\/g, '/'))
    .filter(f => !known.has(f))
  orphans.sort()
  return orphans
}

/**
 * Compose the analyzers into a single `StatusReport` for `kbRoot`.
 * Loads `graph.json` once; assumes the caller has already verified the
 * directory is a KB repository.
 */
export async function analyze(kbRoot: string): Promise<StatusReport> {
  const [{ topics, sources }, wikiFiles, graph] = await Promise.all([
    walkRaw(kbRoot),
    walkWiki(kbRoot),
    loadGraph(kbRoot),
  ])

  const rawHashes = new Set<string>()
  for (const s of sources) {
    if (s.sourceHash)
      rawHashes.add(s.sourceHash)
  }

  return {
    kbRoot,
    counts: {
      rawTopics: topics.length,
      rawSources: sources.length,
      wikiArticles: wikiFiles.length,
      graphArticles: Object.keys(graph.nodes.articles).length,
      graphCategories: Object.keys(graph.nodes.categories).length,
    },
    stale: detectStale(graph, rawHashes),
    orphans: detectOrphans(wikiFiles, graph),
    graphLastUpdated: graph.lastUpdated,
  }
}
