import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runIngest } from '../src/commands/ingest'
import { readClipboardSource } from '../src/commands/ingest/inputs/clipboard'
import { readFileSource } from '../src/commands/ingest/inputs/file'
import { runInteractiveInput } from '../src/commands/ingest/inputs/interactive'
import { htmlToMarkdown, readUrlSource } from '../src/commands/ingest/inputs/url'
import { sha256, writeRawSource } from '../src/commands/ingest/writer'
import { runInit } from '../src/commands/init'

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'kb-ingest-'))
  await runInit({ cwd: workDir })
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('writeRawSource', () => {
  const fixedNow = () => new Date('2026-04-08T12:00:00Z')

  it('writes file with frontmatter and returns sourceHash', async () => {
    const result = await writeRawSource({
      topic: 'demo',
      rootDir: workDir,
      now: fixedNow,
      source: {
        filename: 'note.md',
        content: 'hello world',
        origin: '/tmp/note.md',
      },
    })

    expect(result.status).toBe('written')
    expect(result.sourceHash).toBe(sha256('hello world'))
    const content = await readFile(result.filePath, 'utf8')
    expect(content).toContain('---\n')
    expect(content).toContain(`sourceHash: "${sha256('hello world')}"`)
    expect(content).toContain('ingestedAt: "2026-04-08T12:00:00.000Z"')
    expect(content).toContain('source: "/tmp/note.md"')
    expect(content).toContain('hello world')
    expect(result.filePath).toBe(join(workDir, 'raw', 'demo', 'note.md'))
  })

  it('detects duplicates by sourceHash and skips writing', async () => {
    const opts = {
      topic: 'demo',
      rootDir: workDir,
      now: fixedNow,
      source: {
        filename: 'a.md',
        content: 'same content',
        origin: 'first',
      },
    }
    const first = await writeRawSource(opts)
    expect(first.status).toBe('written')

    const second = await writeRawSource({
      ...opts,
      source: { ...opts.source, filename: 'b.md', origin: 'second' },
    })
    expect(second.status).toBe('duplicate')
    expect(second.filePath).toBe(first.filePath)
    // Only one file exists.
    await expect(stat(join(workDir, 'raw', 'demo', 'b.md'))).rejects.toThrow()
  })

  it('avoids overwriting existing non-duplicate files', async () => {
    await writeRawSource({
      topic: 'demo',
      rootDir: workDir,
      source: { filename: 'note.md', content: 'one', origin: 'a' },
    })
    const result = await writeRawSource({
      topic: 'demo',
      rootDir: workDir,
      source: { filename: 'note.md', content: 'two', origin: 'b' },
    })
    expect(result.status).toBe('written')
    expect(result.filePath).toBe(join(workDir, 'raw', 'demo', 'note-1.md'))
  })
})

describe('readFileSource', () => {
  it('reads an existing file and wraps it', async () => {
    const path = join(workDir, 'input.md')
    await writeFile(path, '# hi', 'utf8')
    const source = await readFileSource({ filePath: path })
    expect(source.content).toBe('# hi')
    expect(source.filename).toBe('input.md')
    expect(source.origin).toBe(path)
  })

  it('throws on missing file', async () => {
    await expect(
      readFileSource({ filePath: join(workDir, 'nope.md') }),
    ).rejects.toThrow(/File not found/)
  })
})

describe('readUrlSource', () => {
  it('converts HTML response to markdown', async () => {
    const fetchMock = (async () =>
      new Response('<h1>Title</h1><p>Body text</p>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })) as typeof fetch
    const source = await readUrlSource({
      url: 'https://example.com/page',
      fetchImpl: fetchMock,
    })
    expect(source.content).toContain('# Title')
    expect(source.content).toContain('Body text')
    expect(source.origin).toBe('https://example.com/page')
    expect(source.filename.endsWith('.md')).toBe(true)
  })

  it('throws on non-ok response', async () => {
    const fetchMock = (async () =>
      new Response('nope', { status: 404, statusText: 'Not Found' })) as typeof fetch
    await expect(
      readUrlSource({ url: 'https://x.test/', fetchImpl: fetchMock }),
    ).rejects.toThrow(/404/)
  })

  it('htmlToMarkdown strips scripts and anchors correctly', () => {
    const md = htmlToMarkdown(
      '<script>bad()</script><p>See <a href="https://a.test">link</a></p>',
    )
    expect(md).not.toContain('bad()')
    expect(md).toContain('[link](https://a.test)')
  })
})

describe('readClipboardSource', () => {
  it('uses injected reader', async () => {
    const source = await readClipboardSource({
      reader: async () => 'clip content',
    })
    expect(source.content).toBe('clip content')
    expect(source.origin).toBe('clipboard')
    expect(source.filename.startsWith('clipboard-')).toBe(true)
  })

  it('throws when clipboard empty', async () => {
    await expect(
      readClipboardSource({ reader: async () => '   ' }),
    ).rejects.toThrow(/empty/)
  })
})

describe('runInteractiveInput', () => {
  it('collects topic and content via prompter', async () => {
    const answers = ['my-topic', 'the content']
    const prompter = {
      prompt: async () => answers.shift() ?? '',
    }
    const result = await runInteractiveInput({ prompter })
    expect(result.topic).toBe('my-topic')
    expect(result.source.content).toBe('the content')
    expect(result.source.origin).toBe('interactive')
  })

  it('throws when topic missing', async () => {
    const prompter = { prompt: async () => '' }
    await expect(runInteractiveInput({ prompter })).rejects.toThrow(/Topic/)
  })
})

describe('runIngest (end-to-end)', () => {
  it('refuses to run outside a KB repository', async () => {
    const bareDir = await mkdtemp(join(tmpdir(), 'kb-bare-'))
    try {
      await expect(
        runIngest({ cwd: bareDir, topic: 'x', file: 'whatever' }),
      ).rejects.toThrow(/Not a KB repository/)
    }
    finally {
      await rm(bareDir, { recursive: true, force: true })
    }
  })

  it('ingests --file into raw/<topic>/', async () => {
    const path = join(workDir, 'note.md')
    await writeFile(path, 'hello', 'utf8')
    const result = await runIngest({
      cwd: workDir,
      topic: 'demo',
      file: path,
    })
    expect(result.status).toBe('written')
    const written = await readFile(result.filePath, 'utf8')
    expect(written).toContain('hello')
  })

  it('ingests --url via injected fetch', async () => {
    const fetchImpl = (async () =>
      new Response('<h1>Hi</h1>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as typeof fetch
    const result = await runIngest({
      cwd: workDir,
      topic: 'demo',
      url: 'https://example.com/x',
      fetchImpl,
    })
    expect(result.status).toBe('written')
  })

  it('ingests --clipboard via injected reader', async () => {
    const result = await runIngest({
      cwd: workDir,
      topic: 'demo',
      clipboard: true,
      clipboardReader: async () => 'clipped',
    })
    expect(result.status).toBe('written')
  })

  it('interactive mode via injected prompter (no flags)', async () => {
    const answers = ['interactive-topic', 'interactive body']
    const result = await runIngest({
      cwd: workDir,
      prompter: { prompt: async () => answers.shift() ?? '' },
    })
    expect(result.status).toBe('written')
    expect(result.topic).toBe('interactive-topic')
  })

  it('detects duplicates on re-ingest', async () => {
    const path = join(workDir, 'same.md')
    await writeFile(path, 'same body', 'utf8')
    await runIngest({ cwd: workDir, topic: 'demo', file: path })
    const again = await runIngest({ cwd: workDir, topic: 'demo', file: path })
    expect(again.status).toBe('duplicate')
  })

  it('rejects multiple input modes', async () => {
    await expect(
      runIngest({
        cwd: workDir,
        topic: 'demo',
        file: 'a',
        clipboard: true,
      }),
    ).rejects.toThrow(/at most one/)
  })
})
