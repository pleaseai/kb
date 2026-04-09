import type { CompileTaskResult, LlmClient } from './executor'
import type { ChangeSet } from './planner'
import { loadGraph, saveGraph } from '../../graph'
import { executeCompile } from './executor'
import { appendCompileLog } from './log'
import { planCompile } from './planner'

export interface CompilePipelineOptions {
  rootDir: string
  topic?: string
  full?: boolean
  llm: LlmClient
  now?: () => Date
}

export interface CompilePipelineResult {
  plan: ChangeSet
  results: CompileTaskResult[]
}

/**
 * Orchestrates the full `kb compile` pipeline:
 *
 *   1. Build a ChangeSet from raw/ vs graph.json
 *   2. Decide which topics to compile (added + modified, or everything
 *      under --full)
 *   3. Run the executor per topic (isolates failures)
 *   4. Update graph.json article nodes with new metadata/sourceHash
 *   5. Append a `log.md` entry summarizing what was compiled
 *
 * This function is the single place where planning, execution, and
 * persistence are stitched together. The CLI wrapper (`runCompile`) and
 * tests both go through here.
 */
export async function runCompilePipeline(
  options: CompilePipelineOptions,
): Promise<CompilePipelineResult> {
  const { rootDir, topic, full, llm, now } = options

  const plan = await planCompile({ rootDir, topic })

  // When --full is passed we compile every topic that has raw sources,
  // regardless of hash. Otherwise stick to the incremental path.
  const targets = full
    ? [...plan.added, ...plan.modified, ...plan.unchanged].sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
      )
    : [...plan.added, ...plan.modified].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  if (targets.length === 0)
    return { plan, results: [] }

  const results = await executeCompile({ rootDir, topics: targets, llm, now })

  // Reflect successful compiles into graph.json. We deliberately do not
  // run the full graph re-index here (category clustering, link parsing)
  // — that's a separate track. The minimum requirement from SPEC SC-003
  // is that article nodes exist with matching sourceHash so subsequent
  // `kb status` / `kb compile` runs see the correct incremental state.
  const compiledTopics = results
    .filter(r => r.status === 'compiled' && r.sourceHash)
    .map(r => r.topic)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  if (compiledTopics.length > 0) {
    const graph = await loadGraph(rootDir)
    const today = (now ?? (() => new Date()))()
    const todayDate = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`
    for (const result of results) {
      if (result.status !== 'compiled' || !result.sourceHash)
        continue
      const existing = graph.nodes.articles[result.topic]
      graph.nodes.articles[result.topic] = {
        feature: result.summary ?? existing?.feature ?? result.topic,
        category: existing?.category ?? 'uncategorized',
        dependencies: existing?.dependencies ?? [],
        metadata: {
          path: `wiki/${result.topic}.md`,
          tags: result.tags ?? [],
          created: existing?.metadata.created ?? todayDate,
          updated: todayDate,
          sourceHash: result.sourceHash,
        },
      }
    }
    await saveGraph(rootDir, graph)
  }

  if (compiledTopics.length > 0) {
    await appendCompileLog({
      rootDir,
      topics: compiledTopics,
      action: full ? 'compile --full' : 'compile',
      now,
    })
  }

  return { plan, results }
}
