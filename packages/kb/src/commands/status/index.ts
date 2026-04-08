import type { StatusReport } from './types'
import process from 'node:process'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { dirname } from 'pathe'
import { findConfigFile, KB_CONFIG_FILENAME } from '../../config/load'
import { analyze } from './analyze'
import { formatReport } from './format'
import { StatusReportSchema } from './types'

export interface RunStatusOptions {
  cwd?: string
}

/**
 * Programmatic entry point for `kb status`. Resolves the KB root from `cwd`
 * (walking upward for `kb.config.json`) and returns a validated report.
 */
export async function runStatus(
  options: RunStatusOptions = {},
): Promise<StatusReport> {
  const cwd = options.cwd ?? process.cwd()
  const configPath = findConfigFile(cwd)
  if (!configPath) {
    throw new Error(
      `Not a KB repository: no ${KB_CONFIG_FILENAME} found in ${cwd} or any parent. Run \`kb init\` first.`,
    )
  }
  const rootDir = dirname(configPath)
  const report = await analyze(rootDir)
  // Validate before handing back so `--json` consumers get a known shape.
  return StatusReportSchema.parse(report)
}

export const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show counts, staleness, and orphaned wiki articles for the current KB',
  },
  args: {
    json: {
      type: 'boolean',
      description: 'Emit machine-readable JSON instead of a human summary',
      default: false,
    },
  },
  async run({ args }) {
    try {
      const report = await runStatus()
      if (args.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      }
      else {
        consola.log(formatReport(report))
      }
    }
    catch (error) {
      consola.error((error as Error).message)
      process.exit(1)
    }
  },
})
