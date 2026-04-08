import type { StatusReport } from './types'

/**
 * Render a `StatusReport` as a multi-line, human-readable summary.
 * Pure function — does no IO — so callers can pipe it through consola
 * or capture it in tests without mocking the logger.
 */
export function formatReport(report: StatusReport): string {
  const { counts, stale, orphans, graphLastUpdated } = report
  const lines: string[] = []

  lines.push(`KB: ${report.kbRoot}`)
  lines.push(
    `  raw:   ${counts.rawTopics} topics, ${counts.rawSources} sources`,
  )
  lines.push(`  wiki:  ${counts.wikiArticles} articles`)
  lines.push(
    `  graph: ${counts.graphArticles} articles, ${counts.graphCategories} categories`
    + ` (lastUpdated: ${graphLastUpdated ?? 'never'})`,
  )

  if (stale.length === 0 && orphans.length === 0) {
    lines.push('  status: healthy ✓')
    return lines.join('\n')
  }

  if (stale.length > 0) {
    lines.push(`  stale (${stale.length}):`)
    for (const s of stale)
      lines.push(`    - ${s.articleId}  (${s.path})`)
  }

  if (orphans.length > 0) {
    lines.push(`  orphans (${orphans.length}):`)
    for (const o of orphans)
      lines.push(`    - ${o}`)
  }

  return lines.join('\n')
}
