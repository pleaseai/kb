/**
 * A resolved ingest source ready to be written to `raw/<topic>/`.
 */
export interface Source {
  /** Filename (with extension) under `raw/<topic>/`. */
  filename: string
  /** Raw markdown/text content (without frontmatter). */
  content: string
  /** Origin descriptor recorded into frontmatter (file path, URL, "clipboard", "interactive"). */
  origin: string
}

export interface IngestOptions {
  topic: string
  source: Source
  /** KB root directory (containing `kb.config.json` and `raw/`). */
  rootDir: string
  /** Override timestamp (for deterministic tests). */
  now?: () => Date
}

export type IngestStatus = 'written' | 'duplicate'

export interface IngestResult {
  status: IngestStatus
  filePath: string
  sourceHash: string
}
