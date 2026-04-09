/**
 * Recursive Delimiter-Aware Text Chunker
 *
 * Ported from gbrain (MIT), `vendor/gbrain/src/core/chunkers/recursive.ts`.
 * Keep this file shape- and behavior-compatible with upstream so future
 * improvements can be pulled in mechanically.
 *
 * 5-level delimiter hierarchy:
 *   0. Paragraphs (\n\n)
 *   1. Lines (\n)
 *   2. Sentences (. ! ? followed by space or newline)
 *   3. Clauses (; : ,)
 *   4. Words (whitespace)
 *
 * Defaults: 300-word chunks with 50-word sentence-aware overlap.
 * Lossless invariant at `chunkOverlap = 0`: concatenating all chunks
 * reproduces the original content modulo trailing whitespace.
 */

const WORD_WITH_TRAILING_RE = /\S+\s*/g
const WORD_RE = /\S+/g
const SENTENCE_BOUNDARY_RE = /[.!?]\s+/
const SENTENCE_BOUNDARY_PREFIX_RE = /^[.!?]\s+/

const DELIMITERS: string[][] = [
  ['\n\n'], // L0: paragraphs
  ['\n'], // L1: lines
  ['. ', '! ', '? ', '.\n', '!\n', '?\n'], // L2: sentences
  ['; ', ': ', ', '], // L3: clauses
  [], // L4: words (whitespace split)
]

export interface ChunkOptions {
  /** Target words per chunk. Defaults to 300. */
  chunkSize?: number
  /** Overlap words to prepend from the previous chunk. Defaults to 50. */
  chunkOverlap?: number
}

export interface TextChunk {
  text: string
  index: number
}

export function chunkText(text: string, opts?: ChunkOptions): TextChunk[] {
  const chunkSize = opts?.chunkSize ?? 300
  const chunkOverlap = opts?.chunkOverlap ?? 50

  if (!text || text.trim().length === 0)
    return []

  if (countWords(text) <= chunkSize)
    return [{ text: text.trim(), index: 0 }]

  const pieces = recursiveSplit(text, 0, chunkSize)
  const merged = greedyMerge(pieces, chunkSize)
  const withOverlap = applyOverlap(merged, chunkOverlap)

  return withOverlap.map((t, i) => ({ text: t.trim(), index: i }))
}

function recursiveSplit(text: string, level: number, target: number): string[] {
  if (level >= DELIMITERS.length)
    return splitOnWhitespace(text, target)

  const delimiters = DELIMITERS[level]
  if (delimiters.length === 0)
    return splitOnWhitespace(text, target)

  const pieces = splitAtDelimiters(text, delimiters)

  // If splitting didn't help, try the next level
  if (pieces.length <= 1)
    return recursiveSplit(text, level + 1, target)

  const result: string[] = []
  for (const piece of pieces) {
    if (countWords(piece) > target)
      result.push(...recursiveSplit(piece, level + 1, target))
    else
      result.push(piece)
  }
  return result
}

/**
 * Split text at delimiter boundaries, preserving each delimiter at the
 * tail of the preceding piece (lossless).
 */
function splitAtDelimiters(text: string, delimiters: string[]): string[] {
  const pieces: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    let earliest = -1
    let earliestDelim = ''

    for (const delim of delimiters) {
      const idx = remaining.indexOf(delim)
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx
        earliestDelim = delim
      }
    }

    if (earliest === -1) {
      pieces.push(remaining)
      break
    }

    const piece = remaining.slice(0, earliest + earliestDelim.length)
    if (piece.trim().length > 0)
      pieces.push(piece)
    remaining = remaining.slice(earliest + earliestDelim.length)
  }

  return pieces.filter(p => p.trim().length > 0)
}

function splitOnWhitespace(text: string, target: number): string[] {
  const words = text.match(WORD_WITH_TRAILING_RE) ?? []
  if (words.length === 0)
    return []
  const pieces: string[] = []
  for (let i = 0; i < words.length; i += target) {
    const slice = words.slice(i, i + target).join('')
    if (slice.trim().length > 0)
      pieces.push(slice)
  }
  return pieces
}

/**
 * Greedily merge adjacent pieces until each chunk approaches the target,
 * capping individual chunks at target * 1.5 to avoid runaway merges.
 */
function greedyMerge(pieces: string[], target: number): string[] {
  if (pieces.length === 0)
    return []
  const result: string[] = []
  let current = pieces[0]
  const cap = Math.ceil(target * 1.5)
  for (let i = 1; i < pieces.length; i++) {
    const combined = current + pieces[i]
    if (countWords(combined) <= cap) {
      current = combined
    }
    else {
      result.push(current)
      current = pieces[i]
    }
  }
  if (current.trim().length > 0)
    result.push(current)
  return result
}

/**
 * Apply sentence-aware trailing overlap: the last N words of chunk[i]
 * are prepended to chunk[i+1].
 */
function applyOverlap(chunks: string[], overlapWords: number): string[] {
  if (chunks.length <= 1 || overlapWords <= 0)
    return chunks
  const result: string[] = [chunks[0]]
  for (let i = 1; i < chunks.length; i++) {
    const prevTrailing = extractTrailingContext(chunks[i - 1], overlapWords)
    result.push(prevTrailing + chunks[i])
  }
  return result
}

function extractTrailingContext(text: string, targetWords: number): string {
  const words = text.match(WORD_WITH_TRAILING_RE) ?? []
  if (words.length <= targetWords)
    return ''
  const trailing = words.slice(-targetWords).join('')
  const sentenceStart = trailing.search(SENTENCE_BOUNDARY_RE)
  if (sentenceStart !== -1 && sentenceStart < trailing.length / 2) {
    const afterSentence = trailing.slice(sentenceStart).replace(SENTENCE_BOUNDARY_PREFIX_RE, '')
    if (afterSentence.trim().length > 0)
      return afterSentence
  }
  return trailing
}

function countWords(text: string): number {
  return (text.match(WORD_RE) ?? []).length
}
