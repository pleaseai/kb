import type { CompileTaskResult, LlmClient } from './executor'
import type { ChangeSet } from './planner'
import process from 'node:process'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { dirname } from 'pathe'
import { findConfigFile, KB_CONFIG_FILENAME, loadConfig } from '../../config/load'
import { resolveLlmClient } from './llm'
import { runCompilePipeline } from './pipeline'
import { planCompile } from './planner'

export interface RunCompileOptions {
  cwd?: string
  /** Only plan/compile this topic. */
  topic?: string
  /** Print the change set and exit without invoking the LLM. */
  dryRun?: boolean
  /** Force recompilation of every topic regardless of sourceHash. */
  full?: boolean
  /** Inject an LLM client (tests, programmatic use). */
  llm?: LlmClient
  /** Injectable clock for deterministic tests. */
  now?: () => Date
}

export interface RunCompileResult {
  plan: ChangeSet
  /** Whether the executor actually ran. False under `--dry-run`. */
  executed: boolean
  /** Per-topic results when the executor ran. */
  results?: CompileTaskResult[]
}

function resolveRoot(cwd: string): string {
  const configPath = findConfigFile(cwd)
  if (!configPath) {
    throw new Error(
      `Not a KB repository: no ${KB_CONFIG_FILENAME} found in ${cwd} or any parent. Run \`kb init\` first.`,
    )
  }
  return dirname(configPath)
}

function formatPlan(plan: ChangeSet): string {
  const lines: string[] = []
  const push = (label: string, items: string[]): void => {
    if (items.length === 0) {
      lines.push(`  ${label}: (none)`)
      return
    }
    lines.push(`  ${label}:`)
    for (const item of items)
      lines.push(`    - ${item}`)
  }
  lines.push('Compile plan:')
  push('added', plan.added)
  push('modified', plan.modified)
  push('unchanged', plan.unchanged)
  push('deleted', plan.deleted)
  return lines.join('\n')
}

/**
 * Programmatic entry point for `kb compile`.
 *
 * In dry-run mode this returns the `ChangeSet` without touching the LLM
 * or writing any files. Otherwise it runs the full compile pipeline
 * (plan → execute → update graph → append log).
 *
 * Callers may inject an `LlmClient` via `options.llm`. When omitted, kb
 * resolves one from `kb.config.json` via `resolveLlmClient`.
 */
export async function runCompile(
  options: RunCompileOptions = {},
): Promise<RunCompileResult> {
  const cwd = options.cwd ?? process.cwd()
  const rootDir = resolveRoot(cwd)

  if (options.dryRun) {
    const plan = await planCompile({ rootDir, topic: options.topic })
    return { plan, executed: false }
  }

  let llm = options.llm
  if (!llm) {
    const loaded = await loadConfig(rootDir)
    llm = resolveLlmClient({ model: loaded.config.llm.model })
  }

  const { plan, results } = await runCompilePipeline({
    rootDir,
    topic: options.topic,
    full: options.full,
    llm,
    now: options.now,
  })

  return { plan, executed: true, results }
}

export const compileCommand = defineCommand({
  meta: {
    name: 'compile',
    description: 'Compile raw sources into wiki articles (incremental by default)',
  },
  args: {
    'topic': {
      type: 'positional',
      description: 'Only compile the given topic',
      required: false,
    },
    'dry-run': {
      type: 'boolean',
      description: 'Print the change set without calling the LLM',
      default: false,
    },
    'full': {
      type: 'boolean',
      description: 'Force recompilation of every topic',
      default: false,
    },
  },
  async run({ args }) {
    try {
      const result = await runCompile({
        topic: args.topic,
        dryRun: args['dry-run'],
        full: args.full,
      })
      consola.log(formatPlan(result.plan))
    }
    catch (error) {
      consola.error((error as Error).message)
      process.exit(1)
    }
  },
})
