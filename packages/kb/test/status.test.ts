import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runIngest } from '../src/commands/ingest'
import { sha256 } from '../src/commands/ingest/writer'
import { runInit } from '../src/commands/init'
import {
  analyze,
  detectOrphans,
  detectStale,
  walkRaw,
  walkWiki,
} from '../src/commands/status/analyze'
import { formatReport } from '../src/commands/status/format'
import { runStatus } from '../src/commands/status'
import { StatusReportSchema } from '../src/commands/status/types'
import { createEmptyGraph, loadGraph, saveGraph } from '../src/graph'

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'kb-status-'))
  await runInit({ cwd: workDir })
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('walkRaw', () => {
  it('returns empty topics/sources on a fresh KB', async () => {
    const result = await walkRaw(workDir)
    expect(result.topics).toEqual([])
    expect(result.sources).toEqual([])
  })

  it('counts topics and sources and parses sourceHash from frontmatter', async () => {
    await runIngest({
      cwd: workDir,
      topic: 'auth',
      file: await fixtureFile('login.md', 'login content'),
    })
    await runIngest({
      cwd: workDir,
      topic: 'auth',
      file: await fixtureFile('logout.md', 'logout content'),
    })
    await runIngest({
      cwd: workDir,
      topic: 'billing',
      file: await fixtureFile('plans.md', 'plans content'),
    })

    const result = await walkRaw(workDir)
    expect(result.topics).toEqual(['auth', 'billing'])
    expect(result.sources).toHaveLength(3)
    const hashes = result.sources.map(s => s.sourceHash)
    expect(hashes).toContain(sha256('login content'))
    expect(hashes).toContain(sha256('logout content'))
    expect(hashes).toContain(sha256('plans content'))
  })
})

describe('walkWiki', () => {
  it('lists nested wiki markdown files relative to kbRoot', async () => {
    await mkdir(join(workDir, 'wiki', 'auth'), { recursive: true })
    await writeFile(join(workDir, 'wiki', 'auth', 'login.md'), '# login')
    await writeFile(join(workDir, 'wiki', 'index.md'), '# index')
    await writeFile(join(workDir, 'wiki', 'ignored.txt'), 'no')

    const files = await walkWiki(workDir)
    expect(files).toEqual(['wiki/auth/login.md', 'wiki/index.md'])
  })
})

describe('detectStale', () => {
  it('flags articles whose recordedHash is missing from raw', () => {
    const graph = createEmptyGraph()
    graph.nodes.articles['auth/login'] = {
      feature: 'auth',
      category: 'flows',
      dependencies: [],
      metadata: {
        path: 'wiki/auth/login.md',
        tags: [],
        created: '2026-01-01',
        updated: '2026-01-01',
        sourceHash: 'OLD',
      },
    }
    graph.nodes.articles['auth/logout'] = {
      feature: 'auth',
      category: 'flows',
      dependencies: [],
      metadata: {
        path: 'wiki/auth/logout.md',
        tags: [],
        created: '2026-01-01',
        updated: '2026-01-01',
        sourceHash: 'CURRENT',
      },
    }

    const stale = detectStale(graph, new Set(['CURRENT']))
    expect(stale).toEqual([
      { articleId: 'auth/login', path: 'wiki/auth/login.md', recordedHash: 'OLD' },
    ])
  })
})

describe('detectOrphans', () => {
  it('flags wiki files not referenced by any graph article', () => {
    const graph = createEmptyGraph()
    graph.nodes.articles['known'] = {
      feature: 'auth',
      category: 'flows',
      dependencies: [],
      metadata: {
        path: 'wiki/auth/login.md',
        tags: [],
        created: '2026-01-01',
        updated: '2026-01-01',
        sourceHash: 'h',
      },
    }
    const orphans = detectOrphans(
      ['wiki/auth/login.md', 'wiki/auth/dangling.md'],
      graph,
    )
    expect(orphans).toEqual(['wiki/auth/dangling.md'])
  })
})

describe('analyze + runStatus integration', () => {
  it('reports zero everything on a freshly init-ed KB', async () => {
    const report = await runStatus({ cwd: workDir })
    expect(StatusReportSchema.parse(report)).toBeTruthy()
    expect(report.counts).toEqual({
      rawTopics: 0,
      rawSources: 0,
      wikiArticles: 0,
      graphArticles: 0,
      graphCategories: 0,
    })
    expect(report.stale).toEqual([])
    expect(report.orphans).toEqual([])
  })

  it('flags a stale article when its raw source is re-ingested with new content', async () => {
    // Ingest v1 and record its hash in graph as if a wiki had been compiled.
    const v1 = await runIngest({
      cwd: workDir,
      topic: 'auth',
      file: await fixtureFile('login.md', 'v1 content'),
    })
    const graph = await loadGraph(workDir)
    graph.nodes.articles['auth/login'] = {
      feature: 'auth',
      category: 'flows',
      dependencies: [],
      metadata: {
        path: 'wiki/auth/login.md',
        tags: [],
        created: '2026-01-01',
        updated: '2026-01-01',
        sourceHash: v1.sourceHash,
      },
    }
    await saveGraph(workDir, graph)
    await mkdir(join(workDir, 'wiki', 'auth'), { recursive: true })
    await writeFile(join(workDir, 'wiki', 'auth', 'login.md'), '# login')

    // Sanity: not stale yet.
    const before = await analyze(workDir)
    expect(before.stale).toEqual([])
    expect(before.orphans).toEqual([])

    // Re-ingest with NEW content under a new filename → new hash.
    await runIngest({
      cwd: workDir,
      topic: 'auth',
      file: await fixtureFile('login-v2.md', 'v2 content'),
    })
    // Remove the old raw file so its hash is no longer present.
    await rm(v1.filePath)

    const after = await analyze(workDir)
    expect(after.stale).toHaveLength(1)
    expect(after.stale[0]).toMatchObject({
      articleId: 'auth/login',
      path: 'wiki/auth/login.md',
    })
  })

  it('detects orphaned wiki files', async () => {
    await mkdir(join(workDir, 'wiki', 'misc'), { recursive: true })
    await writeFile(join(workDir, 'wiki', 'misc', 'dangling.md'), '# dangling')

    const report = await analyze(workDir)
    expect(report.orphans).toEqual(['wiki/misc/dangling.md'])
  })

  it('throws when run outside a KB repository', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'kb-outside-'))
    try {
      await expect(runStatus({ cwd: outside })).rejects.toThrow(/Not a KB repository/)
    }
    finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe('formatReport', () => {
  it('renders healthy KB summary', async () => {
    const report = await analyze(workDir)
    const out = formatReport(report)
    expect(out).toContain('raw:   0 topics, 0 sources')
    expect(out).toContain('healthy')
  })

  it('renders stale and orphans sections when present', () => {
    const out = formatReport({
      kbRoot: '/x',
      counts: { rawTopics: 1, rawSources: 1, wikiArticles: 2, graphArticles: 1, graphCategories: 0 },
      stale: [{ articleId: 'a/b', path: 'wiki/a/b.md', recordedHash: 'h' }],
      orphans: ['wiki/a/c.md'],
      graphLastUpdated: '2026-04-08T00:00:00Z',
    })
    expect(out).toContain('stale (1)')
    expect(out).toContain('a/b')
    expect(out).toContain('orphans (1)')
    expect(out).toContain('wiki/a/c.md')
  })
})

// --- helpers ---
async function fixtureFile(name: string, content: string): Promise<string> {
  const dir = join(workDir, '__fixtures__')
  await mkdir(dir, { recursive: true })
  const full = join(dir, name)
  await writeFile(full, content, 'utf8')
  return full
}
