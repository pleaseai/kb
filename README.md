# kb

Build and maintain structured knowledge bases in GitHub repositories.

Stop researching the same topics across projects. `kb` turns scattered notes into a curated, structured knowledge base that your team — and your AI agents — can actually use.

## Why

- You research "WebSocket vs SSE" in Project A. Six months later, you research it again in Project B.
- Your findings live in Slack threads, Notion pages, and markdown files nobody can find.
- AI coding agents need structured context to perform well. Unstructured document dumps [make them worse, not better](https://github.com/pleaseai/ask/tree/main/evals/nuxt-ui).

`kb` gives your research a home: a GitHub repo with structured articles, a knowledge graph for navigation, and LLM-powered compilation from raw notes into clean wiki entries.

## How It Works

```
raw/                    wiki/                   graph.json
├── websocket-vs-sse/   ├── websocket-vs-sse.md ┌─────────────────┐
│   ├── mdn-notes.md    ├── oauth2-flows.md     │ categories:     │
│   └── rfc-compare.md  └── ...                 │   networking    │
└── oauth2-flows/                               │   auth          │
    └── research.md          ▲                  │ articles:       │
         │                   │                  │   ws-vs-sse ... │
         └── kb compile ─────┘                  │ edges: [...]    │
              (LLM)          │                  └─────────────────┘
                             │                       │
                        graph.json ──→ INDEX.md (generated view)
```

1. Collect raw research into `raw/<topic>/`
2. Run `kb compile` — an LLM synthesizes raw sources into structured wiki articles
3. `graph.json` tracks the knowledge graph; `INDEX.md` is generated for browsing
4. Only changed topics are recompiled (incremental, like `make`)
5. Browse in Obsidian, deploy as a Docus site, or pull into projects via [ASK](https://github.com/pleaseai/ask)

## Installation

```bash
bun install -g @pleaseai/kb
```

## Quick Start

```bash
# Initialize a new KB
kb init my-team-kb
cd my-team-kb
git init && git remote add origin git@github.com:my-org/team-kb.git

# Add raw research
kb ingest websocket-vs-sse --from notes.md
kb ingest websocket-vs-sse --from https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

# Compile into a wiki article
kb compile websocket-vs-sse

# Check what you've got
kb status

# Commit and push
git add -A && git commit -m "feat: add websocket-vs-sse article"
git push
```

## Commands

### `kb init [directory]`

Initialize a new knowledge base.

```bash
kb init                     # Current directory
kb init my-team-kb          # New directory
kb init --with-site         # Include Docus config for site deployment
```

### `kb ingest <topic>`

Add raw source material for a topic.

```bash
kb ingest                                              # Interactive prompt (topic + content)
kb ingest --topic websocket-vs-sse --file notes.md     # From local file
kb ingest --topic websocket-vs-sse --url https://...   # From URL (HTML→markdown)
kb ingest --topic websocket-vs-sse --clipboard         # From system clipboard
```

Each ingested source is written to `raw/<topic>/` as a markdown file with
YAML frontmatter (`source`, `ingestedAt`, `sourceHash`). Re-ingesting the
same content is detected via `sourceHash` and skipped.

### `kb compile [topic]`

Compile raw sources into structured wiki articles using an LLM. Incremental by default — only recompiles topics whose raw `sourceHash` has changed since the last run.

```bash
kb compile                    # Compile all topics whose raw sources changed
kb compile websocket-vs-sse   # Only this topic
kb compile --full             # Force recompilation of every topic
kb compile --dry-run          # Print the change set without calling the LLM
```

Compile runs a four-step pipeline:

1. **Plan** — hash every `raw/<topic>/` directory, diff against `graph.json`
2. **Execute** — for added/modified topics, load raw sources, window them via the recursive chunker, call the LLM, and write `wiki/<topic>.md` with frontmatter (`title`, `summary`, `tags`, `created`, `updated`, `sources`, `sourceHash`)
3. **Graph update** — refresh article nodes in `graph.json` with the new metadata and `sourceHash`
4. **Log append** — write a `## [YYYY-MM-DD] compile | ...` entry to `log.md`

Use `--dry-run` first to preview what will be compiled:

```bash
$ kb compile --dry-run
Compile plan:
  added:
    - websocket-vs-sse
  modified: (none)
  unchanged:
    - oauth2-flows
  deleted: (none)
```

Programmatic use (tests, custom LLM providers) can inject an `LlmClient`:

```ts
import { runCompile } from '@pleaseai/kb'

await runCompile({
  cwd: '/path/to/kb',
  llm: { complete: async ({ system, user }) => myModel.call(system, user) },
})
```

> The built-in LLM provider adapter is not yet wired. Until it ships, non-dry-run CLI runs require injecting a client programmatically.

### `kb index`

Rebuild `graph.json` and regenerate `INDEX.md`.

```bash
kb index
```

### `kb status`

Check KB health.

```bash
kb status                     # All topics
kb status websocket-vs-sse    # One topic
```

### `kb query <question>`

Ask a question against the KB. Answers are synthesized from relevant articles.

```bash
kb query "What auth flow should I use for a mobile app?"
kb query "WebSocket vs SSE tradeoffs" --save   # Save answer as a new wiki article
```

### `kb lint`

Validate structure and content.

```bash
kb lint                       # Structural checks (fast)
kb lint --semantic             # Include LLM-powered checks (contradictions, gaps, suggestions)
```

### `kb serve`

Start a local Docus dev server (requires `--with-site` setup).

```bash
kb serve
```

## Knowledge Graph

`kb` maintains a `graph.json` that maps the structure of your knowledge base, inspired by Microsoft's [RPG-Encoder](https://arxiv.org/abs/2602.02084) for repository representation.

The graph has two node types:

- **Categories** — Semantic groupings (e.g., "Networking", "Auth") auto-generated by LLM clustering
- **Articles** — Individual wiki documents with metadata and source hashes

And two edge types:

- **Functional** — Category → article (containment)
- **Dependency** — Article → article (references)

This enables:

- **Incremental compilation** — Source hashes in the graph track what changed. Only modified topics are recompiled, like RPG-Encoder's 95.7% cost reduction.
- **Staleness propagation** — When article A changes, articles that depend on A are flagged as potentially stale.
- **Structured navigation** — `INDEX.md` is generated from the graph, organized by categories. AI agents use a "Search → Zoom" pattern: scan categories, find the right one, drill into articles.

## Using KB Articles in Projects

KB articles are consumed through [ASK](https://github.com/pleaseai/ask), which handles the last mile of making documents available to AI coding agents:

```bash
# In your project — pull a specific article
ask docs add github:my-org/team-kb --docs-path wiki/websocket-vs-sse.md

# Pull everything
ask docs add github:my-org/team-kb --docs-path wiki/

# Keep in sync
ask docs sync
```

ASK stores the articles locally, generates Claude Code skills, and updates `AGENTS.md` — so your AI agent can reference accurate team knowledge while coding.

## KB Structure

```
my-team-kb/
├── raw/                    # Unprocessed source material
│   └── <topic>/
│       └── *.md
├── wiki/                   # Compiled articles (LLM-generated)
│   └── <topic>.md
├── graph.json              # Knowledge graph
├── INDEX.md                # Auto-generated from graph.json
├── log.md                  # Append-only activity log
└── kb.config.json          # Configuration
```

### Article Format

Each wiki article has YAML frontmatter and a "Related" section for graph edges:

```markdown
---
title: WebSocket vs SSE
summary: Comparison of WebSocket and Server-Sent Events for real-time communication.
tags: [networking, real-time, websocket, sse]
created: 2026-04-08
updated: 2026-04-08
sources:
  - raw/websocket-vs-sse/mdn-notes.md
  - raw/websocket-vs-sse/rfc-comparison.md
---

# WebSocket vs SSE

Article content...

## Related

- [HTTP/2 Streams](http2-streams.md) — Multiplexed streams as an alternative
- [gRPC Basics](grpc-basics.md) — Uses HTTP/2 for bidirectional RPC
```

### INDEX.md

Auto-generated from `graph.json`, organized by semantic categories:

```markdown
## Networking

Network protocols, real-time communication, and transport layers.

| Topic | Summary | Tags | Updated |
|-------|---------|------|---------|
| [WebSocket vs SSE](wiki/websocket-vs-sse.md) | Comparison of WebSocket and SSE... | networking, real-time | 2026-04-08 |
```

## Browsing & Deployment

### Obsidian

The KB repo is a valid Obsidian vault. Open the repo root in Obsidian to get full-text search, graph view, and a nice reading experience. All links use standard markdown syntax.

### Docus Site

Deploy the KB as a searchable documentation site:

```bash
kb init my-team-kb --with-site    # Scaffold with Docus config
kb serve                          # Local dev server
bun run build                     # Build for deployment
```

Deploys to Cloudflare Pages, Vercel, or Netlify. Provides full-text search, web access for the whole team, and AI-ready endpoints (`llms.txt`, MCP server) via Docus.

## Configuration

`kb.config.json`:

```json
{
  "version": 1,
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514"
  },
  "staleness": {
    "warnAfterDays": 90
  },
  "site": {
    "enabled": false,
    "title": "Team KB"
  }
}
```

## Design Principles

- **Structured over raw** — Compiled articles beat document dumps. AI agents perform dramatically better with structured, focused documents than with large unstructured text.
- **Knowledge compounds** — Queries saved as articles, lint-discovered gaps filled with new research, cross-references maintained automatically. The KB gets richer with every interaction, not just every source added.
- **Incremental over full** — Only recompile what changed. Source hashes in `graph.json` make compilation as efficient as `make`.
- **Graph over flat index** — Semantic categories and dependency edges enable agents to navigate efficiently via "Search → Zoom" rather than scanning a flat list.
- **GitHub is the backend** — Version history, PRs for review, branching for concurrent edits, CI for automation. No custom infrastructure.
- **LLMs compile, humans curate** — The LLM does all the grunt work — summarizing, cross-referencing, filing, bookkeeping. Humans decide what to research and review what gets published.
- **Four consumption channels** — Obsidian (local), Docus (web), ASK (AI agents), git (raw access). Same content, different interfaces.

## Related

- [Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — The pattern that inspired `kb`: LLMs maintain a persistent, compounding wiki instead of rediscovering knowledge from scratch on every query.
- [@pleaseai/ask](https://github.com/pleaseai/ask) — Downloads version-specific library docs for AI agents. Consumes KB articles via its GitHub source adapter.
- [@pleaseai/soop](https://github.com/pleaseai/soop) — TypeScript implementation of RPG/RPG-Encoder. `kb`'s graph design is based on soop's RPG structure; future versions may reuse soop's graph primitives and navigation tools directly.
- [RPG / RPG-Encoder](https://arxiv.org/abs/2602.02084) — Microsoft's graph representation for code repositories. Inspired `graph.json` design and incremental compilation.
- [Docus](https://docus.dev) — Markdown documentation site generator. Powers the optional KB site deployment.

## License

MIT
