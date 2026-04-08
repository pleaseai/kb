import type { KbConfig } from './schema'

export const DEFAULT_KB_CONFIG: KbConfig = {
  version: 1,
  llm: {
    model: 'anthropic/claude-sonnet-4-20250514',
  },
  staleness: {
    warnAfterDays: 90,
    checkUrls: false,
  },
  compile: {
    systemPrompt: null,
    articleTemplate: null,
  },
  site: {
    enabled: false,
    title: 'Team KB',
    url: null,
  },
}
