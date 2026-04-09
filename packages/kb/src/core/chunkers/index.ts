import type { ChunkOptions, TextChunk } from './recursive'
import { chunkText as recursiveChunk } from './recursive'

export type { ChunkOptions, TextChunk } from './recursive'

export type ChunkerKind = 'recursive'

export interface ChunkerRequest extends ChunkOptions {
  kind?: ChunkerKind
}

export interface Chunker {
  chunk: (text: string, opts?: ChunkOptions) => TextChunk[]
}

/**
 * Resolve a chunker by kind. Only the `recursive` chunker ships in v1;
 * semantic and LLM-guided chunkers from gbrain are deferred to later
 * tracks behind this same dispatcher.
 */
export function getChunker(kind: ChunkerKind = 'recursive'): Chunker {
  switch (kind) {
    case 'recursive':
      return { chunk: recursiveChunk }
    default: {
      // Exhaustive check — if ChunkerKind grows, TS will flag this branch.
      const exhaustive: never = kind
      throw new Error(`Unknown chunker kind: ${String(exhaustive)}`)
    }
  }
}

/**
 * Convenience wrapper that resolves the default chunker and chunks text
 * in one call. Most call sites inside kb compile want this.
 */
export function chunk(text: string, request: ChunkerRequest = {}): TextChunk[] {
  const { kind = 'recursive', ...opts } = request
  return getChunker(kind).chunk(text, opts)
}
