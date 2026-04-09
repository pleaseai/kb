import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { planCompile } from '../src/commands/compile/planner'
import { runInit } from '../src/commands/init'
import { hashTopicDir } from '../src/core/hash'
import { loadGraph, saveGraph } from '../src/graph'

let workDir: string

async function writeRaw(topic: string, filename: string, content: string): Promise<void> {
  const topicDir = join(workDir, 'raw', topic)
  await mkdir(topicDir, { recursive: true })
  await writeFile(join(topicDir, filename), content, 'utf8')
}

async function seedArticleNode(topic: string, sourceHash: string): Promise<void> {
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
      sourceHash,
    },
  }
  await saveGraph(workDir, graph)
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'kb-planner-'))
  await runInit({ cwd: workDir })
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('planCompile', () => {
  it('returns an empty plan when raw/ is empty', async () => {
    const plan = await planCompile({ rootDir: workDir })
    expect(plan).toEqual({ added: [], modified: [], deleted: [], unchanged: [] })
  })

  it('classifies a topic with raw sources and no article as added', async () => {
    await writeRaw('websocket-vs-sse', 'mdn.md', 'content')
    const plan = await planCompile({ rootDir: workDir })
    expect(plan.added).toEqual(['websocket-vs-sse'])
    expect(plan.modified).toEqual([])
    expect(plan.deleted).toEqual([])
    expect(plan.unchanged).toEqual([])
  })

  it('classifies a topic with matching sourceHash as unchanged', async () => {
    await writeRaw('oauth2-flows', 'rfc.md', 'content')
    const topicHash = await hashTopicDir(join(workDir, 'raw', 'oauth2-flows'))
    await seedArticleNode('oauth2-flows', topicHash)

    const plan = await planCompile({ rootDir: workDir })
    expect(plan.unchanged).toEqual(['oauth2-flows'])
    expect(plan.added).toEqual([])
    expect(plan.modified).toEqual([])
  })

  it('classifies a topic with mismatched sourceHash as modified', async () => {
    await writeRaw('jwt', 'notes.md', 'old content')
    await seedArticleNode('jwt', 'deadbeef'.repeat(8))

    const plan = await planCompile({ rootDir: workDir })
    expect(plan.modified).toEqual(['jwt'])
    expect(plan.added).toEqual([])
    expect(plan.unchanged).toEqual([])
  })

  it('classifies a topic present in graph but missing from raw as deleted', async () => {
    await seedArticleNode('orphan', 'deadbeef'.repeat(8))

    const plan = await planCompile({ rootDir: workDir })
    expect(plan.deleted).toEqual(['orphan'])
    expect(plan.added).toEqual([])
    expect(plan.modified).toEqual([])
  })

  it('handles a mixed change set across multiple topics', async () => {
    // added
    await writeRaw('new-topic', 'a.md', 'fresh')
    // unchanged
    await writeRaw('stable', 'a.md', 'stable content')
    const stableHash = await hashTopicDir(join(workDir, 'raw', 'stable'))
    await seedArticleNode('stable', stableHash)
    // modified
    await writeRaw('edited', 'a.md', 'edited content')
    await seedArticleNode('edited', 'deadbeef'.repeat(8))
    // deleted
    await seedArticleNode('gone', 'cafebabe'.repeat(8))

    const plan = await planCompile({ rootDir: workDir })
    expect(plan.added.sort()).toEqual(['new-topic'])
    expect(plan.unchanged.sort()).toEqual(['stable'])
    expect(plan.modified.sort()).toEqual(['edited'])
    expect(plan.deleted.sort()).toEqual(['gone'])
  })

  it('restricts the plan to a single topic when topic filter is given', async () => {
    await writeRaw('one', 'a.md', 'one')
    await writeRaw('two', 'a.md', 'two')

    const plan = await planCompile({ rootDir: workDir, topic: 'one' })
    expect(plan.added).toEqual(['one'])
    expect(plan.unchanged).toEqual([])
    expect(plan.modified).toEqual([])
  })

  it('ignores non-directory entries inside raw/', async () => {
    await mkdir(join(workDir, 'raw'), { recursive: true })
    await writeFile(join(workDir, 'raw', 'stray.md'), 'noise', 'utf8')

    const plan = await planCompile({ rootDir: workDir })
    expect(plan).toEqual({ added: [], modified: [], deleted: [], unchanged: [] })
  })

  it('skips topic directories that contain no markdown files', async () => {
    await mkdir(join(workDir, 'raw', 'empty'), { recursive: true })
    await writeFile(join(workDir, 'raw', 'empty', 'notes.txt'), 'not md', 'utf8')

    const plan = await planCompile({ rootDir: workDir })
    expect(plan.added).toEqual([])
    expect(plan.modified).toEqual([])
  })
})
