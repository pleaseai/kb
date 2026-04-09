import { appendFile } from 'node:fs/promises'
import { join } from 'pathe'

export interface LogCompileOptions {
  rootDir: string
  topics: string[]
  /** Label describing the operation (`compile`, `compile --full`). */
  action?: string
  now?: () => Date
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Append a compile entry to `log.md` per SPEC §"Activity Log".
 *
 * One block per call. For a single-topic run the heading reads
 * `## [date] compile | <topic>`; for multi-topic runs it reads
 * `## [date] compile | <N> topics` and the body lists them.
 */
export async function appendCompileLog(
  options: LogCompileOptions,
): Promise<void> {
  const { rootDir, topics } = options
  if (topics.length === 0)
    return

  const now = options.now ?? (() => new Date())
  const action = options.action ?? 'compile'
  const date = formatDate(now())

  const heading = topics.length === 1
    ? `## [${date}] ${action} | ${topics[0]}`
    : `## [${date}] ${action} | ${topics.length} topics`

  const body = topics.length === 1
    ? `Compiled ${topics[0]}.`
    : `Compiled:\n${topics.map(t => `- ${t}`).join('\n')}`

  const entry = `\n${heading}\n${body}\n`
  await appendFile(join(rootDir, 'log.md'), entry, 'utf8')
}
