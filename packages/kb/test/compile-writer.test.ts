import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeWikiArticle } from '../src/commands/compile/writer'
import { runInit } from '../src/commands/init'

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'kb-compile-writer-'))
  await runInit({ cwd: workDir })
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('writeWikiArticle (new article)', () => {
  it('creates wiki/<topic>.md with frontmatter and body', async () => {
    const result = await writeWikiArticle({
      rootDir: workDir,
      topic: 'websocket-vs-sse',
      body: '# WebSocket vs SSE\n\nContent here.\n',
      summary: 'Comparison of WebSocket and SSE',
      tags: ['networking', 'real-time'],
      sources: ['raw/websocket-vs-sse/mdn.md'],
      sourceHash: 'a'.repeat(64),
      now: () => new Date('2026-04-09T12:00:00Z'),
    })

    expect(result.path).toBe(join(workDir, 'wiki', 'websocket-vs-sse.md'))
    const written = await readFile(result.path, 'utf8')
    expect(written).toContain('---\n')
    expect(written).toContain('title: "WebSocket vs SSE"')
    expect(written).toContain('summary: "Comparison of WebSocket and SSE"')
    expect(written).toContain('tags:\n  - networking\n  - real-time')
    expect(written).toContain('created: "2026-04-09"')
    expect(written).toContain('updated: "2026-04-09"')
    expect(written).toContain('sources:\n  - raw/websocket-vs-sse/mdn.md')
    expect(written).toMatch(/sourceHash: "[a-f0-9]{64}"/)
    expect(written).toContain('# WebSocket vs SSE\n\nContent here.')
  })

  it('derives title from the first markdown heading when not supplied', async () => {
    const result = await writeWikiArticle({
      rootDir: workDir,
      topic: 'oauth2',
      body: '# OAuth 2 Flows\n\nBody.\n',
      summary: 'Auth flows',
      tags: [],
      sources: ['raw/oauth2/rfc.md'],
      sourceHash: 'a'.repeat(64),
      now: () => new Date('2026-04-09T12:00:00Z'),
    })
    const written = await readFile(result.path, 'utf8')
    expect(written).toContain('title: "OAuth 2 Flows"')
  })
})

describe('writeWikiArticle (update existing)', () => {
  const FIXED_NOW = () => new Date('2026-05-01T00:00:00Z')

  async function seedExisting(): Promise<void> {
    const existing = [
      '---',
      'title: "OAuth 2 Flows"',
      'summary: "old summary"',
      'tags:',
      '  - auth',
      'created: "2026-04-01"',
      'updated: "2026-04-01"',
      'sources:',
      '  - raw/oauth2/old.md',
      'sourceHash: "0000000000000000000000000000000000000000000000000000000000000000"',
      '---',
      '',
      '# OAuth 2 Flows',
      '',
      'Old body.',
      '',
    ].join('\n')
    await writeFile(join(workDir, 'wiki', 'oauth2.md'), existing, 'utf8')
  }

  it('preserves created but bumps updated when rewriting an existing article', async () => {
    await seedExisting()
    const result = await writeWikiArticle({
      rootDir: workDir,
      topic: 'oauth2',
      body: '# OAuth 2 Flows\n\nNew body.\n',
      summary: 'new summary',
      tags: ['auth', 'oauth'],
      sources: ['raw/oauth2/new.md'],
      sourceHash: 'b'.repeat(64),
      now: FIXED_NOW,
    })
    const written = await readFile(result.path, 'utf8')
    expect(written).toContain('created: "2026-04-01"')
    expect(written).toContain('updated: "2026-05-01"')
    expect(written).toContain('summary: "new summary"')
    expect(written).toContain('New body.')
    expect(written).not.toContain('Old body.')
  })

  it('escapes double quotes in string fields', async () => {
    const result = await writeWikiArticle({
      rootDir: workDir,
      topic: 'weird',
      body: '# Weird "Quoted" Title\n\n',
      summary: 'has "quotes"',
      tags: [],
      sources: [],
      sourceHash: 'c'.repeat(64),
      now: () => new Date('2026-04-09T12:00:00Z'),
    })
    const written = await readFile(result.path, 'utf8')
    expect(written).toContain('title: "Weird \\"Quoted\\" Title"')
    expect(written).toContain('summary: "has \\"quotes\\""')
  })
})
