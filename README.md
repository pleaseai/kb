# kb

Build and maintain structured knowledge bases in GitHub repositories.

Stop researching the same topics across projects. `kb` turns scattered notes into a curated, structured knowledge base that your team — and your AI agents — can actually use.

## Why

- You research "WebSocket vs SSE" in Project A. Six months later, you research it again in Project B.
- Your findings live in Slack threads, Notion pages, and markdown files nobody can find.
- AI coding agents need structured context to perform well. Unstructured document dumps [make them worse, not better](https://github.com/pleaseai/ask/tree/main/evals/nuxt-ui).

`kb` gives your research a home: a GitHub repo with structured articles, automatic indexing, and LLM-powered compilation from raw notes into clean wiki entries.

## How It Works

```
raw/                    wiki/                   INDEX.md
├── websocket-vs-sse/   ├── websocket-vs-sse.md ┌──────────────────┐
│   ├── mdn-notes.md    ├── oauth2-flows.md     │ Topic | Summary  │
│   └── rfc-compare.md  └── ...                 │ ───── | ──────── │
└── oauth2-flows/                               │ WS vs SSE | ...  │
    └── research.md          ▲                  │ OAuth2    | ...  │
         │                   │                  └──────────────────┘
         └── kb compile ─────┘                       ▲
              (LLM)                                  │
                                               kb index
```

1. Collect raw research into `raw/<topic>/`
2. Run `kb compile` — an LLM synthesizes raw sources into a structured wiki article
3. `INDEX.md` is auto-generated for browsing and AI agent discovery
4. Open the repo in Obsidian for a nice reading experience
5. Projects pull articles via [ASK](https://github.com/pleaseai/ask) to make them available to AI agents

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
```

### `kb ingest <topic>`

Add raw source material for a topic.

```bash
kb ingest websocket-vs-sse                        # Interactive input
kb ingest websocket-vs-sse --from file.md         # From local file
kb ingest websocket-vs-sse --from https://...     # From URL
kb ingest websocket-vs-sse --from clipboard       # From clipboard
```

### `kb compile [topic]`

Compile raw sources into structured wiki articles using an LLM.

```bash
kb compile websocket-vs-sse   # One topic
kb compile                    # All topics with changes
```

### `kb index`

Regenerate `INDEX.md`.

```bash
kb index
```

### `kb status`

Check KB health.

```bash
kb status                     # All topics
kb status websocket-vs-sse    # One topic
```

### `kb lint`

Validate structure and content.

```bash
kb lint
```

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
├── INDEX.md                # Auto-generated topic index
└── kb.config.json          # Configuration
```

### Article Format

Each wiki article has YAML frontmatter for metadata:

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
```

### INDEX.md

Auto-generated index for humans and AI agents:

```markdown
| Topic | Summary | Tags | Updated |
|-------|---------|------|---------|
| [WebSocket vs SSE](wiki/websocket-vs-sse.md) | Comparison of WebSocket and SSE... | networking, real-time | 2026-04-08 |
```

## Browsing with Obsidian

The KB repo is a valid Obsidian vault. Open the repo root in Obsidian to get full-text search, graph view, and a nice reading experience. All links use standard markdown syntax for compatibility.

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
  }
}
```

## Design Principles

- **Structured over raw** — Compiled articles beat document dumps. AI agents perform dramatically better with structured, focused documents than with large unstructured text.
- **GitHub is the backend** — Version history, PRs for review, branching for concurrent edits, CI for automation. No custom infrastructure.
- **LLMs compile, humans curate** — The LLM synthesizes raw notes into articles. Humans decide what to research and review what gets published.
- **Obsidian-compatible** — Standard markdown, no proprietary formats. The KB repo works as an Obsidian vault out of the box.
- **ASK consumes** — `kb` produces knowledge. ASK delivers it to AI agents. Each tool does one thing.

## Related

- [@pleaseai/ask](https://github.com/pleaseai/ask) — Downloads version-specific library docs for AI agents. Consumes KB articles via its GitHub source adapter.
- [Andrej Karpathy's LLM OS](https://x.com/karpathy/status/1882192640392106260) — Inspiration for the personal/team knowledge base workflow.

## License

MIT
