import type { LlmClient } from './executor'

export interface LlmConfig {
  /** Full model identifier, typically `<provider>/<model>`. */
  model: string
}

/**
 * Resolve an `LlmClient` for production use from the `llm.model` field
 * in `kb.config.json`. The identifier follows the Vercel AI SDK Gateway
 * convention (`anthropic/claude-sonnet-4-…`, `openai/gpt-5-…`).
 *
 * The real adapter — wiring the AI SDK and a transport — is intentionally
 * deferred to a follow-up track so we can ship the pipeline's shape, tests,
 * and planning behavior without taking on the SDK dependency today.
 * Until then, callers must inject their own `LlmClient` via
 * `runCompile({ llm })`. This function throws with an actionable message
 * when they don't.
 */
export function resolveLlmClient(config: LlmConfig): LlmClient {
  throw new Error(
    `kb compile: no LLM client configured for model "${config.model}". `
    + 'The built-in provider adapter is not yet wired in this build. '
    + 'Either pass a custom `llm` client to runCompile() programmatically, '
    + 'or wait for the LLM adapter track that lands the AI SDK integration.',
  )
}
