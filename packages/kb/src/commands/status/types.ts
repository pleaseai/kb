import { z } from 'zod'

/**
 * Structured report produced by `analyze(kbRoot)` and consumed by either
 * the human formatter or `--json` output.
 */
export const StatusReportSchema = z.object({
  kbRoot: z.string().min(1),
  counts: z.object({
    rawTopics: z.number().int().nonnegative(),
    rawSources: z.number().int().nonnegative(),
    wikiArticles: z.number().int().nonnegative(),
    graphArticles: z.number().int().nonnegative(),
    graphCategories: z.number().int().nonnegative(),
  }).strict(),
  stale: z.array(z.object({
    articleId: z.string(),
    path: z.string(),
    recordedHash: z.string(),
  }).strict()),
  orphans: z.array(z.string()),
  graphLastUpdated: z.string().nullable(),
}).strict()

export type StatusReport = z.infer<typeof StatusReportSchema>
