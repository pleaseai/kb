import type { IngestOptions, IngestResult } from './types'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'pathe'

const FRONTMATTER_FENCE = '---'
const HASH_LINE_RE = /^sourceHash:\s*"?([a-f0-9]{64})"?\s*$/m
const QUOTE_RE = /"/g
const UNSAFE_PATH_RE = /[/\\\0]|^\.\.?$|(?:^|\/)\.\.(?:\/|$)/

export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Reject path segments (topic, filename) that contain separators, parent
 * references, or null bytes. These would allow a malicious source to escape
 * the KB's `raw/` directory and write anywhere on disk.
 */
export function assertSafePathSegment(label: string, value: string): void {
  if (!value || !value.trim()) {
    throw new Error(`${label} must not be empty`)
  }
  if (UNSAFE_PATH_RE.test(value)) {
    throw new Error(
      `${label} contains unsafe path characters (separators, '..', or null): ${JSON.stringify(value)}`,
    )
  }
}

function buildFrontmatter(
  origin: string,
  ingestedAt: string,
  sourceHash: string,
): string {
  const escape = (s: string): string => s.replace(QUOTE_RE, '\\"')
  return [
    FRONTMATTER_FENCE,
    `source: "${escape(origin)}"`,
    `ingestedAt: "${ingestedAt}"`,
    `sourceHash: "${sourceHash}"`,
    FRONTMATTER_FENCE,
    '',
  ].join('\n')
}

async function findDuplicate(
  topicDir: string,
  sourceHash: string,
): Promise<string | null> {
  if (!existsSync(topicDir))
    return null
  const entries = await readdir(topicDir)
  for (const entry of entries) {
    if (!entry.endsWith('.md'))
      continue
    const full = join(topicDir, entry)
    const text = await readFile(full, 'utf8')
    const match = text.match(HASH_LINE_RE)
    if (match && match[1] === sourceHash)
      return full
  }
  return null
}

function uniqueFilename(topicDir: string, filename: string): string {
  const full = join(topicDir, filename)
  if (!existsSync(full))
    return full
  const dot = filename.lastIndexOf('.')
  const base = dot === -1 ? filename : filename.slice(0, dot)
  const ext = dot === -1 ? '' : filename.slice(dot)
  let i = 1
  while (existsSync(join(topicDir, `${base}-${i}${ext}`)))
    i += 1
  return join(topicDir, `${base}-${i}${ext}`)
}

/**
 * Write a `Source` to `<rootDir>/raw/<topic>/<filename>` with YAML frontmatter
 * containing `source`, `ingestedAt`, and `sourceHash`.
 *
 * Duplicate detection: if any existing file under the topic directory carries
 * the same `sourceHash`, return `{ status: 'duplicate' }` without writing.
 */
export async function writeRawSource(
  options: IngestOptions,
): Promise<IngestResult> {
  const { topic, source, rootDir } = options
  assertSafePathSegment('topic', topic)
  assertSafePathSegment('source.filename', source.filename)
  const now = options.now ?? (() => new Date())
  const topicDir = join(rootDir, 'raw', topic)

  const sourceHash = sha256(source.content)

  const existing = await findDuplicate(topicDir, sourceHash)
  if (existing) {
    return { status: 'duplicate', filePath: existing, sourceHash }
  }

  await mkdir(topicDir, { recursive: true })

  const filePath = uniqueFilename(topicDir, source.filename)
  const frontmatter = buildFrontmatter(
    source.origin,
    now().toISOString(),
    sourceHash,
  )
  await writeFile(filePath, frontmatter + source.content, 'utf8')

  return { status: 'written', filePath, sourceHash }
}
