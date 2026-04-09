import { describe, expect, it } from 'vitest'
import { buildCompilePrompt, parseCompiledResponse } from '../src/commands/compile/prompt'

describe('buildCompilePrompt', () => {
  it('includes topic, sources, and kb-meta instructions', () => {
    const prompt = buildCompilePrompt({
      topic: 'websocket-vs-sse',
      sources: [
        { path: 'raw/websocket-vs-sse/mdn.md', content: 'WebSocket is...' },
      ],
    })
    expect(prompt.system).toContain('technical knowledge base compiler')
    expect(prompt.system).toContain('kb-meta')
    expect(prompt.user).toContain('websocket-vs-sse')
    expect(prompt.user).toContain('raw/websocket-vs-sse/mdn.md')
    expect(prompt.user).toContain('WebSocket is...')
  })

  it('lists sibling articles when provided', () => {
    const prompt = buildCompilePrompt({
      topic: 'jwt',
      sources: [{ path: 'raw/jwt/a.md', content: 'body' }],
      siblings: ['oauth2-flows', 'session-management'],
    })
    expect(prompt.user).toContain('oauth2-flows')
    expect(prompt.user).toContain('session-management')
  })

  it('includes the existing article body when updating', () => {
    const prompt = buildCompilePrompt({
      topic: 'jwt',
      sources: [{ path: 'raw/jwt/a.md', content: 'new content' }],
      existing: '# JWT\n\nOld body.',
    })
    expect(prompt.user).toContain('<existing-article>')
    expect(prompt.user).toContain('Old body.')
  })
})

describe('parseCompiledResponse', () => {
  it('splits body and kb-meta', () => {
    const response = [
      '# WebSocket vs SSE',
      '',
      'Article body here.',
      '',
      '```kb-meta',
      'summary: Comparison of WebSocket and SSE',
      'tags: networking, real-time',
      '```',
    ].join('\n')
    const parsed = parseCompiledResponse(response)
    expect(parsed.summary).toBe('Comparison of WebSocket and SSE')
    expect(parsed.tags).toEqual(['networking', 'real-time'])
    expect(parsed.body).toContain('# WebSocket vs SSE')
    expect(parsed.body).toContain('Article body here.')
    expect(parsed.body).not.toContain('kb-meta')
  })

  it('handles empty tags', () => {
    const response = [
      '# Title',
      '',
      '```kb-meta',
      'summary: Short summary',
      'tags:',
      '```',
    ].join('\n')
    const parsed = parseCompiledResponse(response)
    expect(parsed.tags).toEqual([])
  })

  it('throws when kb-meta block is missing', () => {
    expect(() => parseCompiledResponse('# Title\n\nBody only.')).toThrow(/kb-meta/)
  })

  it('throws when summary is missing', () => {
    const response = [
      '# Title',
      '```kb-meta',
      'tags: a, b',
      '```',
    ].join('\n')
    expect(() => parseCompiledResponse(response)).toThrow(/summary/)
  })
})
