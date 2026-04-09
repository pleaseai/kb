import { describe, expect, it } from 'vitest'
import { chunk, getChunker } from '../src/core/chunkers'

describe('chunker dispatcher', () => {
  it('defaults to the recursive chunker', () => {
    const result = chunk('word '.repeat(1000).trim(), { chunkSize: 100 })
    expect(result.length).toBeGreaterThan(1)
    for (const c of result)
      expect(c.text.length).toBeGreaterThan(0)
  })

  it('forwards options to the underlying chunker', () => {
    const recursive = getChunker('recursive')
    const a = recursive.chunk('word '.repeat(50).trim(), { chunkSize: 10 })
    const b = recursive.chunk('word '.repeat(50).trim(), { chunkSize: 30 })
    expect(a.length).toBeGreaterThan(b.length)
  })

  it('returns empty output for empty input', () => {
    expect(chunk('')).toEqual([])
  })
})
