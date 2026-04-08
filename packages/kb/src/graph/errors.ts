import type { ZodIssue } from 'zod'

/**
 * Thrown when `graph.json` fails validation or cannot be parsed.
 * Carries the structured zod issues so callers can render detailed diagnostics.
 */
export class GraphParseError extends Error {
  readonly issues: ZodIssue[]
  readonly path: string

  constructor(path: string, issues: ZodIssue[], cause?: unknown) {
    const summary = issues.length
      ? issues.map(i => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; ')
      : (cause instanceof Error ? cause.message : 'invalid JSON')
    super(`Failed to parse graph.json at ${path}: ${summary}`)
    this.name = 'GraphParseError'
    this.issues = issues
    this.path = path
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause
    }
  }
}
