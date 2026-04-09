/**
 * Test vectors ported verbatim from gbrain's recursive chunker test suite
 * (`vendor/gbrain/test/chunkers/recursive.test.ts`). Maintaining these
 * vectors lets us pull future upstream improvements mechanically.
 */
import { describe, expect, it } from 'vitest'
import { chunkText } from '../src/core/chunkers/recursive'

describe('recursive chunker', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   ')).toEqual([])
  })

  it('returns single chunk for short text', () => {
    const text = 'Hello world. This is a short text.'
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe(text.trim())
    expect(chunks[0].index).toBe(0)
  })

  it('splits at paragraph boundaries', () => {
    const paragraph = 'word '.repeat(200).trim()
    const text = `${paragraph}\n\n${paragraph}`
    const chunks = chunkText(text, { chunkSize: 250 })
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('respects chunk size target within 1.5x tolerance', () => {
    const text = 'word '.repeat(1000).trim()
    const chunks = chunkText(text, { chunkSize: 100 })
    for (const chunk of chunks) {
      const wordCount = chunk.text.split(/\s+/).length
      expect(wordCount).toBeLessThanOrEqual(150)
    }
  })

  it('applies overlap between chunks', () => {
    const text = 'word '.repeat(1000).trim()
    const chunks = chunkText(text, { chunkSize: 100, chunkOverlap: 20 })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[1].text.length).toBeGreaterThan(0)
  })

  it('splits at sentence boundaries', () => {
    const sentences = Array.from(
      { length: 50 },
      (_, i) => `This is sentence number ${i} with some content about topic ${i}.`,
    ).join(' ')
    const chunks = chunkText(sentences, { chunkSize: 50 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks.slice(0, -1))
      expect(chunk.text).toMatch(/[.!?]/)
  })

  it('assigns sequential indices', () => {
    const text = 'word '.repeat(1000).trim()
    const chunks = chunkText(text, { chunkSize: 100 })
    for (let i = 0; i < chunks.length; i++)
      expect(chunks[i].index).toBe(i)
  })

  it('handles single word input', () => {
    const chunks = chunkText('hello')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe('hello')
  })

  it('handles unicode text', () => {
    const text = `Bonjour le monde. ${'Ceci est un texte en francais. '.repeat(100)}`
    const chunks = chunkText(text, { chunkSize: 50 })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].text).toContain('Bonjour')
  })

  it('splits at single newline when paragraphs are absent', () => {
    const lines = Array.from({ length: 100 }).fill('This is a single line of text.').join('\n')
    const chunks = chunkText(lines, { chunkSize: 20 })
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('handles whitespace-only delimiters (word-level split)', () => {
    const words = Array.from({ length: 200 }).fill('word').join(' ')
    const chunks = chunkText(words, { chunkSize: 50 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks)
      expect(chunk.text.trim().length).toBeGreaterThan(0)
  })

  it('handles clause-level delimiters', () => {
    const text = Array.from({ length: 100 }).fill('clause one; clause two: clause three, clause four').join(' ')
    const chunks = chunkText(text, { chunkSize: 30 })
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('preserves content across chunks with zero overlap', () => {
    const original = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
    const chunks = chunkText(original, { chunkSize: 5, chunkOverlap: 0 })
    const reconstructed = chunks.map(c => c.text).join(' ')
    expect(reconstructed).toContain('First paragraph')
    expect(reconstructed).toContain('Second paragraph')
    expect(reconstructed).toContain('Third paragraph')
  })

  it('default options produce reasonable chunks', () => {
    const text = Array.from({ length: 500 }).fill('This is a test sentence with several words.').join(' ')
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      const wordCount = chunk.text.split(/\s+/).length
      expect(wordCount).toBeLessThanOrEqual(500)
    }
  })

  it('handles mixed delimiter hierarchy', () => {
    const text = [
      'Paragraph one has sentences. And more sentences! Really?',
      '',
      'Paragraph two; with clauses: and more, clauses here.',
      '',
      'Paragraph three.\nWith line breaks.\nAnd more lines.',
    ].join('\n')
    const chunks = chunkText(text, { chunkSize: 10 })
    expect(chunks.length).toBeGreaterThan(1)
  })
})
