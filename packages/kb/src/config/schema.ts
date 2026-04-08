import { z } from 'zod'

/**
 * LLM model identifier passed to the Vercel AI SDK.
 * Typically in `<provider>/<model>` format (e.g. `anthropic/claude-sonnet-4-20250514`),
 * but kept as a free-form string — the AI SDK Gateway resolves and validates it at call time.
 */
const LlmSchema = z.object({
  model: z.string().min(1),
})

const StalenessSchema = z.object({
  warnAfterDays: z.number().int().positive(),
  checkUrls: z.boolean(),
})

const CompileSchema = z.object({
  systemPrompt: z.string().nullable(),
  articleTemplate: z.string().nullable(),
})

const SiteSchema = z.object({
  enabled: z.boolean(),
  title: z.string(),
  url: z.string().nullable(),
})

export const KbConfigSchema = z.object({
  version: z.literal(1),
  llm: LlmSchema,
  staleness: StalenessSchema,
  compile: CompileSchema,
  site: SiteSchema,
})

export type KbConfig = z.infer<typeof KbConfigSchema>
