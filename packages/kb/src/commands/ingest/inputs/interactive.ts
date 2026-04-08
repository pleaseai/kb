import type { Source } from '../types'
import { consola } from 'consola'

const COLON_DOT_RE = /[:.]/g

export interface InteractivePrompter {
  prompt: (
    message: string,
    options?: { type?: 'text', placeholder?: string, initial?: string },
  ) => Promise<string>
}

export interface InteractiveInputOptions {
  prompter?: InteractivePrompter
  /** Injected topic (skips the topic prompt when provided). */
  topic?: string
}

export interface InteractiveResult {
  topic: string
  source: Source
}

const defaultPrompter: InteractivePrompter = {
  async prompt(message, options) {
    const result = (await consola.prompt(message, options ?? { type: 'text' })) as unknown
    return String(result ?? '')
  },
}

/**
 * Interactive ingest flow: prompts the user for a topic (if not provided)
 * and free-form content, then returns them as a ready-to-write Source.
 */
export async function runInteractiveInput(
  options: InteractiveInputOptions = {},
): Promise<InteractiveResult> {
  const prompter = options.prompter ?? defaultPrompter

  const topic = options.topic
    ?? (await prompter.prompt('Topic (folder under raw/):', { type: 'text' }))
  if (!topic || !topic.trim())
    throw new Error('Topic is required')

  const content = await prompter.prompt('Paste or type source content:', {
    type: 'text',
  })
  if (!content || !content.trim())
    throw new Error('Content is required')

  const timestamp = new Date().toISOString().replace(COLON_DOT_RE, '-')
  return {
    topic: topic.trim(),
    source: {
      filename: `note-${timestamp}.md`,
      content,
      origin: 'interactive',
    },
  }
}
