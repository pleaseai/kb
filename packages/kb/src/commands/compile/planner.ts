import { readdir } from 'node:fs/promises'
import { join } from 'pathe'
import { hashTopicDir } from '../../core/hash'
import { loadGraph } from '../../graph'

/**
 * ChangeSet — the output of `planCompile`. Drives which topics the executor
 * needs to (re)compile and which it can skip. The four buckets are disjoint.
 *
 *   added     — raw/<topic>/ exists; no article node in graph.json
 *   modified  — raw/<topic>/ exists; article node present but sourceHash mismatches
 *   unchanged — raw/<topic>/ exists; article node present and sourceHash matches
 *   deleted   — article node present in graph.json; no raw/<topic>/
 */
export interface ChangeSet {
  added: string[]
  modified: string[]
  deleted: string[]
  unchanged: string[]
}

export interface PlanCompileOptions {
  rootDir: string
  /** When set, restrict the plan to a single topic. */
  topic?: string
}

async function listRawTopics(rawDir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(rawDir, { withFileTypes: true })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return []
    throw error
  }
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

async function hasMarkdownSources(topicDir: string): Promise<boolean> {
  const entries = await readdir(topicDir, { withFileTypes: true })
  return entries.some(entry => entry.isFile() && entry.name.endsWith('.md'))
}

/**
 * Compute the `ChangeSet` between `raw/` on disk and the article nodes
 * recorded in `graph.json`.
 *
 * This function is pure with respect to the filesystem — it reads `raw/`
 * and `graph.json` but never writes anything. The caller (`kb compile`) is
 * responsible for acting on the plan.
 */
export async function planCompile(options: PlanCompileOptions): Promise<ChangeSet> {
  const { rootDir, topic: topicFilter } = options

  const rawDir = join(rootDir, 'raw')
  const graph = await loadGraph(rootDir)

  const rawTopicsAll = await listRawTopics(rawDir)
  const graphTopicsAll = Object.keys(graph.nodes.articles).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  )

  const rawTopics = topicFilter
    ? rawTopicsAll.filter(topic => topic === topicFilter)
    : rawTopicsAll
  const graphTopics = topicFilter
    ? graphTopicsAll.filter(topic => topic === topicFilter)
    : graphTopicsAll

  const added: string[] = []
  const modified: string[] = []
  const unchanged: string[] = []
  const deleted: string[] = []

  const rawTopicSet = new Set(rawTopics)

  for (const topic of rawTopics) {
    const topicDir = join(rawDir, topic)
    // Empty or non-markdown topic directories aren't meaningful input
    // for compile and must not be classified as "added".
    if (!(await hasMarkdownSources(topicDir)))
      continue

    const digest = await hashTopicDir(topicDir)
    const article = graph.nodes.articles[topic]

    if (!article) {
      added.push(topic)
      continue
    }

    if (article.metadata.sourceHash === digest)
      unchanged.push(topic)
    else
      modified.push(topic)
  }

  for (const topic of graphTopics) {
    if (!rawTopicSet.has(topic))
      deleted.push(topic)
  }

  return { added, modified, deleted, unchanged }
}
