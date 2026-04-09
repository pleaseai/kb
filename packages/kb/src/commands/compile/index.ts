import type { ChangeSet } from './planner'
import process from 'node:process'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { dirname } from 'pathe'
import { findConfigFile, KB_CONFIG_FILENAME } from '../../config/load'
import { planCompile } from './planner'

export interface RunCompileOptions {
  cwd?: string
  /** Only plan/compile this topic. */
  topic?: string
  /** Print the change set and exit without invoking the LLM. */
  dryRun?: boolean
  /** Force recompilation of every topic regardless of sourceHash. */
  full?: boolean
}

export interface RunCompileResult {
  plan: ChangeSet
  /** Whether the executor actually ran. False under `--dry-run`. */
  executed: boolean
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
 * or writing any files. Non-dry-run execution is deferred to a later task
 * (T007 — executor) and currently throws.
 */
export async function runCompile(
  options: RunCompileOptions = {},
): Promise<RunCompileResult> {
  const cwd = options.cwd ?? process.cwd()
  const rootDir = resolveRoot(cwd)

  const plan = await planCompile({ rootDir, topic: options.topic })

  if (options.dryRun)
    return { plan, executed: false }

  // Executor arrives in T007. Until then, refuse to claim success.
  throw new Error(
    'kb compile executor not yet implemented. Use --dry-run to preview the change set.',
  )
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
