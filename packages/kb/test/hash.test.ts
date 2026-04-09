import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashTopicDir, sha256 } from '../src/core/hash'

let topicDir: string

beforeEach(async () => {
  topicDir = await mkdtemp(join(tmpdir(), 'kb-hash-'))
})

afterEach(async () => {
  await rm(topicDir, { recursive: true, force: true })
})

describe('sha256', () => {
  it('returns a 64-char lowercase hex digest', () => {
    const digest = sha256('hello world')
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for identical content', () => {
    expect(sha256('abc')).toBe(sha256('abc'))
  })

  it('differs for different content', () => {
    expect(sha256('abc')).not.toBe(sha256('abd'))
  })
})

describe('hashTopicDir', () => {
  it('returns a 64-char lowercase hex digest', async () => {
    await writeFile(join(topicDir, 'a.md'), 'alpha', 'utf8')
    const digest = await hashTopicDir(topicDir)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable regardless of filesystem enumeration order', async () => {
    // Write in one order
    await writeFile(join(topicDir, 'b.md'), 'bravo', 'utf8')
    await writeFile(join(topicDir, 'a.md'), 'alpha', 'utf8')
    const first = await hashTopicDir(topicDir)

    // Recreate in opposite order
    await rm(topicDir, { recursive: true, force: true })
    await mkdir(topicDir, { recursive: true })
    await writeFile(join(topicDir, 'a.md'), 'alpha', 'utf8')
    await writeFile(join(topicDir, 'b.md'), 'bravo', 'utf8')
    const second = await hashTopicDir(topicDir)

    expect(first).toBe(second)
  })

  it('changes when any file content changes', async () => {
    await writeFile(join(topicDir, 'a.md'), 'alpha', 'utf8')
    await writeFile(join(topicDir, 'b.md'), 'bravo', 'utf8')
    const before = await hashTopicDir(topicDir)

    await writeFile(join(topicDir, 'b.md'), 'BRAVO', 'utf8')
    const after = await hashTopicDir(topicDir)

    expect(after).not.toBe(before)
  })

  it('changes when a file is added', async () => {
    await writeFile(join(topicDir, 'a.md'), 'alpha', 'utf8')
    const before = await hashTopicDir(topicDir)

    await writeFile(join(topicDir, 'b.md'), 'bravo', 'utf8')
    const after = await hashTopicDir(topicDir)

    expect(after).not.toBe(before)
  })

  it('changes when a file is renamed', async () => {
    await writeFile(join(topicDir, 'a.md'), 'alpha', 'utf8')
    const before = await hashTopicDir(topicDir)

    await rm(join(topicDir, 'a.md'))
    await writeFile(join(topicDir, 'renamed.md'), 'alpha', 'utf8')
    const after = await hashTopicDir(topicDir)

    expect(after).not.toBe(before)
  })

  it('ignores non-markdown files', async () => {
    await writeFile(join(topicDir, 'a.md'), 'alpha', 'utf8')
    const before = await hashTopicDir(topicDir)

    await writeFile(join(topicDir, 'notes.txt'), 'irrelevant', 'utf8')
    const after = await hashTopicDir(topicDir)

    expect(after).toBe(before)
  })

  it('returns a stable value for an empty directory', async () => {
    const digest = await hashTopicDir(topicDir)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('throws when the directory does not exist', async () => {
    await expect(hashTopicDir(join(topicDir, 'missing'))).rejects.toThrow()
  })
})
