import type { LlmClient } from '../src/commands/compile/executor'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCompile } from '../src/commands/compile'
import { writeRawSource } from '../src/commands/ingest/writer'
import { runInit } from '../src/commands/init'
import { hashTopicDir } from '../src/core/hash'
import { loadGraph } from '../src/graph'

async function ingest(rootDir: string, topic: string, filename: string, content: string): Promise<void> {
  await writeRawSource({
    rootDir,
    topic,
    source: { filename, content, origin: `test://${filename}` },
    now: () => new Date('2026-04-09T12:00:00Z'),
  })
}

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'kb-e2e-'))
  await runInit({ cwd: workDir })
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

const FIXED_NOW = () => new Date('2026-04-09T12:00:00Z')

function stubResponse(title: string, summary: string, tags: string[]): string {
  return [
    `# ${title}`,
    '',
    `${title} body goes here.`,
    '',
    '```kb-meta',
    `summary: ${summary}`,
    `tags: ${tags.join(', ')}`,
    '```',
  ].join('\n')
}

describe('kb compile end-to-end', () => {
  it('ingests raw sources, compiles them, and records sourceHash in graph.json', async () => {
    await ingest(workDir, 'websocket-vs-sse', 'notes.md', 'WebSocket is a full-duplex protocol over TCP.')
    await ingest(workDir, 'oauth2-flows', 'rfc.md', 'OAuth 2 defines grant types.')

    const llm: LlmClient = {
      complete: vi.fn().mockImplementation(async ({ user }: { user: string }) => {
        if (user.includes('websocket-vs-sse'))
          return stubResponse('WebSocket vs SSE', 'WS vs SSE comparison', ['networking', 'real-time'])
        if (user.includes('oauth2-flows'))
          return stubResponse('OAuth 2 Flows', 'Overview of OAuth 2 grants', ['auth', 'oauth'])
        throw new Error(`unexpected topic in prompt: ${user.slice(0, 60)}`)
      }),
    }

    const result = await runCompile({
      cwd: workDir,
      dryRun: false,
      llm,
      now: FIXED_NOW,
    })

    expect(result.executed).toBe(true)
    expect(result.results).toHaveLength(2)
    for (const taskResult of result.results ?? [])
      expect(taskResult.status).toBe('compiled')

    // Wiki articles exist
    const wsArticle = await readFile(join(workDir, 'wiki', 'websocket-vs-sse.md'), 'utf8')
    expect(wsArticle).toContain('WebSocket vs SSE body goes here.')
    expect(wsArticle).toMatch(/sourceHash: "[a-f0-9]{64}"/)

    // graph.json has article nodes with matching sourceHash (SC-003)
    const graph = await loadGraph(workDir)
    const wsNode = graph.nodes.articles['websocket-vs-sse']
    expect(wsNode).toBeDefined()
    const wsHash = await hashTopicDir(join(workDir, 'raw', 'websocket-vs-sse'))
    expect(wsNode.metadata.sourceHash).toBe(wsHash)
    expect(wsNode.metadata.path).toBe('wiki/websocket-vs-sse.md')

    // log.md was appended
    const log = await readFile(join(workDir, 'log.md'), 'utf8')
    expect(log).toContain('## [2026-04-09] compile')
    expect(log).toContain('2 topics')

    // Re-running compile with the same sources yields an empty plan (SC-004)
    const rerun = await runCompile({
      cwd: workDir,
      dryRun: true,
    })
    expect(rerun.plan.added).toEqual([])
    expect(rerun.plan.modified).toEqual([])
    expect(rerun.plan.unchanged.sort()).toEqual(['oauth2-flows', 'websocket-vs-sse'])
  })

  it('dry-run produces the same plan without writing files', async () => {
    await ingest(workDir, 'jwt', 'rfc.md', 'JWT is a token format.')

    const result = await runCompile({ cwd: workDir, dryRun: true })
    expect(result.plan.added).toEqual(['jwt'])
    expect(result.executed).toBe(false)

    // wiki/jwt.md should NOT exist
    await expect(readFile(join(workDir, 'wiki', 'jwt.md'), 'utf8')).rejects.toThrow()
  })
})
