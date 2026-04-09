import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'pathe'

/**
 * Primitive SHA-256 digest of a UTF-8 string.
 *
 * Used for per-file source hashing in `kb ingest` and as a building block
 * for `hashTopicDir`, which aggregates file hashes into a stable topic-level
 * fingerprint used by `kb compile` to decide whether a topic needs recompiling.
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Produce a stable SHA-256 fingerprint of every `.md` file under `topicDir`.
 *
 * The fingerprint is computed by:
 *   1. Listing all `.md` files directly in `topicDir`
 *   2. Sorting their basenames lexicographically
 *   3. Feeding `name + "\0" + content + "\0"` for each file into a single hash
 *
 * The null separators make it impossible for a rename (content stays the same
 * but filename changes) or a content swap across files to collide. Only
 * `.md` files are included — sidecar files like `.DS_Store` or auxiliary
 * notes that the user may drop into `raw/<topic>/` must not affect the hash,
 * otherwise unrelated filesystem noise would trigger spurious recompiles.
 *
 * Nested subdirectories under a topic are not supported in v1: the planner
 * treats each `raw/<topic>/` as flat. If subdirectory layouts are introduced
 * later this function should switch to recursive traversal.
 */
export async function hashTopicDir(topicDir: string): Promise<string> {
  const entries = await readdir(topicDir, { withFileTypes: true })
  const markdownFiles = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  const hash = createHash('sha256')
  for (const name of markdownFiles) {
    const content = await readFile(join(topicDir, name), 'utf8')
    hash.update(name, 'utf8')
    hash.update('\0')
    hash.update(content, 'utf8')
    hash.update('\0')
  }
  return hash.digest('hex')
}
