import type { IngestResult, Source } from './types'
import process from 'node:process'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { dirname } from 'pathe'
import { findConfigFile, KB_CONFIG_FILENAME } from '../../config/load'
import { readClipboardSource } from './inputs/clipboard'
import { readFileSource } from './inputs/file'
import { runInteractiveInput } from './inputs/interactive'
import { readUrlSource } from './inputs/url'
import { writeRawSource } from './writer'

export interface RunIngestOptions {
  cwd?: string
  topic?: string
  file?: string
  url?: string
  clipboard?: boolean
  interactive?: boolean
  /** Test hooks */
  fetchImpl?: typeof fetch
  clipboardReader?: () => Promise<string>
  prompter?: Parameters<typeof runInteractiveInput>[0] extends infer P
    ? P extends { prompter?: infer R }
      ? R
      : never
    : never
  now?: () => Date
}

export interface RunIngestResult extends IngestResult {
  topic: string
}

/**
 * Programmatic entry point for `kb ingest`. Resolves the KB root,
 * selects an input mode, and delegates to `writeRawSource()`.
 */
export async function runIngest(
  options: RunIngestOptions = {},
): Promise<RunIngestResult> {
  const cwd = options.cwd ?? process.cwd()

  const configPath = findConfigFile(cwd)
  if (!configPath) {
    throw new Error(
      `Not a KB repository: no ${KB_CONFIG_FILENAME} found in ${cwd} or any parent. Run \`kb init\` first.`,
    )
  }
  const rootDir = dirname(configPath)

  // Determine mode.
  const modesPicked = [options.file, options.url, options.clipboard]
    .filter(Boolean)
    .length
  if (modesPicked > 1) {
    throw new Error(
      'Specify at most one input mode: --file, --url, or --clipboard.',
    )
  }

  let topic = options.topic?.trim()
  let source: Source

  if (options.file) {
    source = await readFileSource({ filePath: options.file, cwd })
  }
  else if (options.url) {
    source = await readUrlSource({
      url: options.url,
      fetchImpl: options.fetchImpl,
    })
  }
  else if (options.clipboard) {
    source = await readClipboardSource({ reader: options.clipboardReader })
  }
  else {
    // Interactive fallback.
    const result = await runInteractiveInput({
      prompter: options.prompter,
      topic,
    })
    topic = result.topic
    source = result.source
  }

  if (!topic)
    throw new Error('--topic is required for non-interactive modes')

  const result = await writeRawSource({
    topic,
    source,
    rootDir,
    now: options.now,
  })

  return { ...result, topic }
}

export const ingestCommand = defineCommand({
  meta: {
    name: 'ingest',
    description: 'Ingest a source (file/url/clipboard/interactive) into raw/<topic>/',
  },
  args: {
    topic: {
      type: 'string',
      description: 'Topic folder under raw/',
    },
    file: {
      type: 'string',
      description: 'Read source from a local file',
    },
    url: {
      type: 'string',
      description: 'Fetch source from a URL (HTML is converted to markdown)',
    },
    clipboard: {
      type: 'boolean',
      description: 'Read source from the system clipboard',
      default: false,
    },
  },
  async run({ args }) {
    try {
      const result = await runIngest({
        topic: args.topic as string | undefined,
        file: args.file as string | undefined,
        url: args.url as string | undefined,
        clipboard: args.clipboard as boolean,
      })
      if (result.status === 'duplicate') {
        consola.info(
          `Already ingested (sourceHash ${result.sourceHash.slice(0, 12)}…): ${result.filePath}`,
        )
      }
      else {
        consola.success(
          `Ingested into ${result.topic}: ${result.filePath}`,
        )
      }
    }
    catch (error) {
      consola.error((error as Error).message)
      process.exit(1)
    }
  },
})
