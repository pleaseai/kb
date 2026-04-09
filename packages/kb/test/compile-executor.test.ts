import type { LlmClient } from '../src/commands/compile/executor'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeCompile } from '../src/commands/compile/executor'
import { runInit } from '../src/commands/init'

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'kb-compile-exec-'))
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

function stubLlm(response: string): LlmClient {
  return { complete: vi.fn().mockResolvedValue(response) }
}

const FIXED_NOW = () => new Date('2026-04-09T12:00:00Z')

const VALID_RESPONSE = [
  '# WebSocket vs SSE',
  '',
  'Comparison body.',
  '',
  '```kb-meta',
  'summary: Comparison of WebSocket and SSE',
  'tags: networking, real-time',
  '```',
].join('\n')

describe('executeCompile', () => {
  it('compiles a single topic end to end', async () => {
    await writeRaw('websocket-vs-sse', 'mdn.md', 'WebSocket is a protocol...')
    const llm = stubLlm(VALID_RESPONSE)

    const results = await executeCompile({
      rootDir: workDir,
      topics: ['websocket-vs-sse'],
      llm,
      now: FIXED_NOW,
    })

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('compiled')
    expect(results[0].topic).toBe('websocket-vs-sse')
    expect(results[0].title).toBe('WebSocket vs SSE')
    expect(results[0].summary).toBe('Comparison of WebSocket and SSE')
    expect(results[0].tags).toEqual(['networking', 'real-time'])
    expect(results[0].sourceHash).toMatch(/^[0-9a-f]{64}$/)

    const written = await readFile(join(workDir, 'wiki', 'websocket-vs-sse.md'), 'utf8')
    expect(written).toContain('title: "WebSocket vs SSE"')
    expect(written).toContain('Comparison body.')
    expect(llm.complete).toHaveBeenCalledTimes(1)
  })

  it('passes existing article body into the prompt when updating', async () => {
    await writeRaw('jwt', 'rfc.md', 'JWT is...')
    const existing = [
      '---',
      'title: "JWT"',
      'summary: "old"',
      'tags: []',
      'created: "2026-04-01"',
      'updated: "2026-04-01"',
      'sources: []',
      'sourceHash: "0000000000000000000000000000000000000000000000000000000000000000"',
      '---',
      '',
      '# JWT',
      '',
      'Old body.',
      '',
    ].join('\n')
    await writeFile(join(workDir, 'wiki', 'jwt.md'), existing, 'utf8')

    const llm = {
      complete: vi.fn().mockResolvedValue(
        [
          '# JWT',
          '',
          'New body.',
          '',
          '```kb-meta',
          'summary: JWT spec and usage',
          'tags: auth, jwt',
          '```',
        ].join('\n'),
      ),
    }

    const results = await executeCompile({
      rootDir: workDir,
      topics: ['jwt'],
      llm,
      now: FIXED_NOW,
    })
    expect(results[0].status).toBe('compiled')

    const call = llm.complete.mock.calls[0][0]
    expect(call.user).toContain('Old body.')
    expect(call.user).toContain('<existing-article>')

    const written = await readFile(join(workDir, 'wiki', 'jwt.md'), 'utf8')
    expect(written).toContain('New body.')
    expect(written).toContain('created: "2026-04-01"')
    expect(written).toContain('updated: "2026-04-09"')
  })

  it('isolates per-topic errors without aborting the batch', async () => {
    await writeRaw('good', 'a.md', 'good content')
    await writeRaw('bad', 'b.md', 'bad content')

    const llm: LlmClient = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(VALID_RESPONSE)
        .mockResolvedValueOnce('# No meta block at all'),
    }

    const results = await executeCompile({
      rootDir: workDir,
      topics: ['good', 'bad'],
      llm,
      now: FIXED_NOW,
    })
    expect(results).toHaveLength(2)
    expect(results[0].status).toBe('compiled')
    expect(results[1].status).toBe('error')
    expect(results[1].error).toMatch(/kb-meta/)
  })

  it('skips topics that have no raw markdown sources', async () => {
    await mkdir(join(workDir, 'raw', 'empty'), { recursive: true })
    const llm = stubLlm(VALID_RESPONSE)

    const results = await executeCompile({
      rootDir: workDir,
      topics: ['empty'],
      llm,
      now: FIXED_NOW,
    })
    expect(results[0].status).toBe('skipped')
    expect(llm.complete).not.toHaveBeenCalled()
  })

  it('windows raw content that exceeds the chunk budget', async () => {
    // A very long source that blows past the budget
    const longContent = `${'word '.repeat(20000).trim()}`
    await writeRaw('huge', 'notes.md', longContent)
    const llm = stubLlm(VALID_RESPONSE)

    await executeCompile({
      rootDir: workDir,
      topics: ['huge'],
      llm,
      chunkWordBudget: 500,
      now: FIXED_NOW,
    })

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const sourcesSection = call.user
    const wordsInSources = (sourcesSection.match(/word/g) ?? []).length
    expect(wordsInSources).toBeLessThan(20000)
  })
})
