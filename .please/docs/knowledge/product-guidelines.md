# Product Guidelines — @pleaseai/kb

## CLI Style

- **Concise output** — Default to minimal output. Use `--verbose` for details.
- **Colored output** — Use colors for status indicators (green=ok, yellow=stale, red=error). Respect `NO_COLOR` env var.
- **Progressive disclosure** — Show summary first, details on request. `kb status` shows overview; `kb status <topic>` shows details.
- **Exit codes** — 0 for success, 1 for errors, 2 for lint warnings.

## Naming Conventions

- **Topics** — kebab-case slugs (`websocket-vs-sse`, `oauth2-flows`)
- **Commands** — Single-word verbs (`init`, `ingest`, `compile`, `index`, `query`, `status`, `lint`, `serve`)
- **Flags** — GNU-style long flags (`--from`, `--save`, `--full`, `--semantic`, `--with-site`)

## Error Handling

- **Actionable errors** — Every error message must suggest what to do next.
- **Graceful degradation** — If LLM is unavailable, deterministic operations (status, structural lint) still work.
- **No silent failures** — Always report what happened, even for partial success.

## Content Quality

- **LLM-generated content is always reviewable** — Show what was generated, allow editing before committing.
- **Source attribution** — Wiki articles always reference their raw sources in frontmatter.
- **Idempotent operations** — Running the same command twice produces the same result (except for LLM variance).

## Design Principles

- **LLMs compile, humans curate** — The LLM handles grunt work; humans decide what to research and review what gets published.
- **Structured over raw** — Compiled articles beat document dumps for both humans and AI agents.
- **GitHub-native** — Leverage git for versioning, PRs for review, CI for automation. No custom backend.
