import type { Source } from '../types'
import { exec } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const COLON_DOT_RE = /[:.]/g

export type ClipboardReader = () => Promise<string>

export interface ClipboardInputOptions {
  reader?: ClipboardReader
}

/**
 * Default platform-specific clipboard reader. Uses `pbpaste` on macOS,
 * `xclip`/`xsel` on Linux, and `powershell Get-Clipboard` on Windows.
 */
export async function defaultClipboardReader(): Promise<string> {
  const platform = process.platform
  const candidates: string[]
    = platform === 'darwin'
      ? ['pbpaste']
      : platform === 'win32'
        ? ['powershell -NoProfile -Command Get-Clipboard']
        : ['xclip -selection clipboard -o', 'xsel --clipboard --output']

  let lastError: unknown
  for (const cmd of candidates) {
    try {
      const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 })
      return stdout
    }
    catch (error) {
      lastError = error
    }
  }
  throw new Error(
    `Unable to read clipboard on ${platform}. Install xclip/xsel on Linux, or pipe content via \`--file -\`. Cause: ${(lastError as Error)?.message ?? 'unknown'}`,
  )
}

/**
 * Read the system clipboard and wrap the contents as a `Source`.
 */
export async function readClipboardSource(
  options: ClipboardInputOptions = {},
): Promise<Source> {
  const reader = options.reader ?? defaultClipboardReader
  const content = await reader()
  if (!content || content.trim().length === 0)
    throw new Error('Clipboard is empty')

  const timestamp = new Date().toISOString().replace(COLON_DOT_RE, '-')
  return {
    filename: `clipboard-${timestamp}.md`,
    content,
    origin: 'clipboard',
  }
}
