import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCompile } from '../src/commands/compile'
import { runInit } from '../src/commands/init'
import { hashTopicDir } from '../src/core/hash'
import { loadGraph, saveGraph } from '../src/graph'

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'kb-compile-'))
  await runInit({ cwd: workDir })
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

async function writeRaw(topic: string, filename: string, content: string): Promise<void> {
  const topicDir = join(workDir, 'raw', topic)
  await mkdir(topicDir, { recursive: true })
  await writeFile(join(topicDir, filename), content, 'utf8')
}

async function seedUnchangedTopic(topic: string, filename: string, content: string): Promise<void> {
  await writeRaw(topic, filename, content)
  const digest = await hashTopicDir(join(workDir, 'raw', topic))
  const graph = await loadGraph(workDir)
  graph.nodes.articles[topic] = {
    feature: `summary for ${topic}`,
    category: 'uncategorized',
    dependencies: [],
    metadata: {
      path: `wiki/${topic}.md`,
      tags: [],
      created: '2026-04-08',
      updated: '2026-04-08',
      sourceHash: digest,
    },
  }
  await saveGraph(workDir, graph)
}

describe('runCompile --dry-run', () => {
  it('returns an empty plan when raw/ is empty', async () => {
    const result = await runCompile({ cwd: workDir, dryRun: true })
    expect(result.plan).toEqual({ added: [], modified: [], deleted: [], unchanged: [] })
    expect(result.executed).toBe(false)
  })

  it('reports added topics', async () => {
    await writeRaw('websocket', 'mdn.md', 'payload')
    const result = await runCompile({ cwd: workDir, dryRun: true })
    expect(result.plan.added).toEqual(['websocket'])
    expect(result.executed).toBe(false)
  })

  it('reports unchanged topics without recompiling them', async () => {
    await seedUnchangedTopic('oauth2', 'rfc.md', 'content')
    const result = await runCompile({ cwd: workDir, dryRun: true })
    expect(result.plan.unchanged).toEqual(['oauth2'])
    expect(result.plan.added).toEqual([])
    expect(result.executed).toBe(false)
  })

  it('restricts dry-run output to a single topic when topic arg is given', async () => {
    await writeRaw('one', 'a.md', '1')
    await writeRaw('two', 'a.md', '2')
    const result = await runCompile({ cwd: workDir, dryRun: true, topic: 'one' })
    expect(result.plan.added).toEqual(['one'])
  })

  it('fails loudly when run outside a KB repository', async () => {
    const notKb = await mkdtemp(join(tmpdir(), 'kb-compile-not-'))
    try {
      await expect(runCompile({ cwd: notKb, dryRun: true })).rejects.toThrow(/KB repository/i)
    }
    finally {
      await rm(notKb, { recursive: true, force: true })
    }
  })
})

describe('runCompile (no dry-run)', () => {
  it('throws a helpful error when no LLM client is configured or injected', async () => {
    await writeRaw('demo', 'a.md', 'body')
    await expect(runCompile({ cwd: workDir, dryRun: false })).rejects.toThrow(
      /no LLM client configured/i,
    )
  })

  it('executes the full pipeline when an LLM client is injected', async () => {
    await writeRaw('demo', 'a.md', 'source body')
    const response = [
      '# Demo',
      '',
      'Compiled body.',
      '',
      '```kb-meta',
      'summary: Demo article',
      'tags: demo, test',
      '```',
    ].join('\n')
    const llm = { complete: async () => response }

    const result = await runCompile({
      cwd: workDir,
      dryRun: false,
      llm,
      now: () => new Date('2026-04-09T12:00:00Z'),
    })

    expect(result.executed).toBe(true)
    expect(result.results).toHaveLength(1)
    expect(result.results?.[0].status).toBe('compiled')
    expect(result.plan.added).toEqual(['demo'])
  })
})
