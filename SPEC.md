# Product Spec — @pleaseai/kb

> A CLI tool for building and maintaining structured knowledge bases in GitHub repositories.

## Problem

Teams repeatedly research the same topics across projects. Findings are scattered in Notion pages, Slack threads, markdown files, and developer memory. When a topic is revisited months later, the previous research is either lost, outdated, or trapped in a project-specific context that nobody can find.

AI coding agents make this worse: they need accurate, structured context to perform well. Unstructured document dumps degrade agent performance (confirmed by ASK evals — llms-full.txt scored 40% vs structured docs at 100%).

## Solution

`kb` manages a GitHub-backed knowledge base of curated, structured markdown documents. It handles ingestion of raw research, LLM-powered compilation into clean wiki articles, graph-based knowledge indexing, and staleness detection.

The KB repo is the **single source of truth** for team knowledge. Individual projects consume KB articles through ASK (`ask docs add github:org/kb --docs-path wiki/topic`), which handles the "last mile" of making documents available to AI agents.

## Non-Goals

- Not a note-taking app (use Obsidian, Notion, etc. for drafts)
- Not a project-local tool — `kb` operates on the KB repo itself
- Does not generate AGENTS.md or Claude Code skills (that's ASK's job)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     KB GitHub Repo                       │
│                                                          │
│  raw/                  wiki/                             │
│  ├── websocket-vs-sse/ ├── websocket-vs-sse.md          │
│  │   ├── source1.md    ├── oauth2-flows.md              │
│  │   └── source2.md    └── ...                          │
│  └── oauth2-flows/                                      │
│      └── rfc-notes.md  graph.json    ← knowledge graph  │
│                        INDEX.md      ← generated view    │
│                        kb.config.json                    │
└────────────────────────────┬────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         Obsidian       Docus site      Projects
         (local)        (web + search)  (via ASK)
```

### Directory Structure

```
kb-repo/
├── raw/                    # Unprocessed source material
│   └── <topic>/            # One directory per topic
│       ├── source1.md      # Raw notes, excerpts, transcripts
│       ├── source2.md
│       └── ...
├── wiki/                   # Compiled, structured articles
│   ├── <topic>.md          # One article per topic
│   └── ...
├── graph.json              # Knowledge graph (source of truth for structure)
├── INDEX.md                # Auto-generated from graph.json
├── log.md                  # Append-only chronological activity log
├── kb.config.json          # KB configuration
└── nuxt.config.ts          # Optional: Docus config for site deployment
```

## Knowledge Graph — `graph.json`

Inspired by Microsoft's [RPG (Repository Planning Graph)](https://arxiv.org/abs/2509.16198) and [RPG-Encoder](https://arxiv.org/abs/2602.02084), KB maintains a hierarchical dual-view graph that enables both efficient incremental updates and structured agent navigation.

RPG demonstrated that replacing natural language with an explicit graph representation dramatically improves agent performance — agents using RPG achieved 93.7% localization accuracy vs ~60-70% with documentation alone, while reducing costs by 95.7% through incremental maintenance. KB applies the same principles to knowledge management: `graph.json` is the structural backbone that makes compilation incremental and navigation efficient.

### Graph Structure

```json
{
  "version": 1,
  "lastUpdated": "2026-04-08T12:00:00Z",
  "nodes": {
    "categories": {
      "networking": {
        "feature": "Network protocols, real-time communication, and transport layers",
        "children": ["websocket-vs-sse", "http2-streams", "grpc-basics"]
      },
      "auth": {
        "feature": "Authentication, authorization, and identity management",
        "children": ["oauth2-flows", "jwt-tokens", "session-management"]
      }
    },
    "articles": {
      "websocket-vs-sse": {
        "feature": "Comparison of WebSocket and Server-Sent Events for real-time bidirectional and unidirectional communication",
        "metadata": {
          "path": "wiki/websocket-vs-sse.md",
          "tags": ["networking", "real-time", "websocket", "sse"],
          "created": "2026-04-08",
          "updated": "2026-04-08",
          "sourceHash": "a3f2c1d..."
        }
      }
    }
  },
  "edges": {
    "functional": [
      { "from": "networking", "to": "websocket-vs-sse" },
      { "from": "networking", "to": "http2-streams" }
    ],
    "dependency": [
      { "from": "websocket-vs-sse", "to": "http2-streams" },
      { "from": "jwt-tokens", "to": "oauth2-flows" }
    ]
  }
}
```

### Node Types

Following RPG's dual-level hierarchy:

- **Category nodes** (`categories`) — High-level groupings that represent knowledge domains. Each has a `feature` (semantic description) and `children` (list of article IDs). Categories are auto-generated during compilation by LLM-based semantic clustering.
- **Article nodes** (`articles`) — Individual wiki documents. Each has a `feature` (one-line semantic summary for search), `metadata` (path, tags, dates), and a `sourceHash` (hash of raw source files used to produce the article — the key to incremental compilation).

### Edge Types

- **Functional edges** — Category → article containment. "This article belongs to this domain." Hierarchical, one-to-many.
- **Dependency edges** — Article → article references. "This article references or builds on that article." Extracted from markdown links in wiki articles during compilation.

### How `graph.json` Is Maintained

The graph is a **derived artifact** — wiki articles (with their frontmatter and internal links) are the source of truth. `graph.json` is rebuilt by `kb index` by:

1. Scanning all wiki article frontmatter → article nodes
2. Parsing markdown links between articles → dependency edges
3. LLM-based semantic clustering of articles → category nodes + functional edges
4. Computing sourceHash for each article's raw sources → enabling incremental compilation

## Incremental Compilation

Inspired by RPG-Encoder's incremental maintenance protocol (which reduced token usage by 95.7% vs full reconstruction), `kb compile` only reprocesses what changed.

### How It Works

```
kb compile
    │
    ├─ 1. Hash raw/<topic>/ files for each topic
    ├─ 2. Compare against graph.json sourceHash
    ├─ 3. Identify changed topics (hash mismatch)
    ├─ 4. For each changed topic:
    │     ├─ Send raw sources + existing article to LLM
    │     ├─ Write updated wiki/<topic>.md
    │     └─ Mark downstream dependents as potentially stale
    └─ 5. Rebuild graph.json (kb index)
```

### Three Update Protocols (from RPG-Encoder)

- **Addition** — New `raw/<topic>/` directory with no corresponding wiki article. LLM compiles from scratch. Graph assigns to existing category by semantic matching, or creates a new category.
- **Modification** — `sourceHash` mismatch (raw sources changed since last compile). LLM receives both existing article and new/changed sources, produces an updated article. Graph re-evaluates category placement only if the article's semantic feature shifts significantly.
- **Deletion** — `raw/<topic>/` removed. Wiki article is removed. Graph prunes the node and cleans up empty categories.

### Staleness Propagation

When article A is recompiled and article B has a dependency edge from A, B is flagged as "potentially stale" in `kb status` output. This doesn't trigger automatic recompilation — it's advisory, letting the team decide if B needs updating.

## CLI Commands

### `kb init`

Initialize a new KB repository.

```bash
kb init                     # Initialize in current directory
kb init my-team-kb          # Create and initialize new directory
kb init --with-site         # Also scaffold Docus config for site deployment
```

Creates the directory structure (`raw/`, `wiki/`), `kb.config.json`, `graph.json`, `INDEX.md`, and a `.gitignore`.

### `kb ingest <topic>`

Add raw source material for a topic.

```bash
kb ingest websocket-vs-sse                        # Interactive: paste or write
kb ingest websocket-vs-sse --from file.md         # From a local file
kb ingest websocket-vs-sse --from https://...     # From a URL (fetched + converted to md)
kb ingest websocket-vs-sse --from clipboard       # From system clipboard
```

Saves source material to `raw/<topic>/`. Does not compile — just collects.

### `kb compile [topic]`

Compile raw sources into wiki articles using an LLM. Incremental by default.

```bash
kb compile websocket-vs-sse   # Compile specific topic (force)
kb compile                    # Compile all topics with changed raw sources
kb compile --full             # Force full recompilation of everything
```

Workflow:
1. Computes sourceHash for each topic's raw files
2. Compares against `graph.json` — skips unchanged topics
3. For changed topics: sends raw sources (+ existing article if updating) to LLM
4. LLM produces structured wiki article with frontmatter
5. LLM also extracts related topics → markdown links in article body
6. Runs `kb index` to rebuild `graph.json` and `INDEX.md`

### `kb index`

Rebuild `graph.json` and regenerate `INDEX.md`.

```bash
kb index
```

Scans wiki articles, parses frontmatter and internal links, runs LLM-based semantic clustering for categories, and writes both `graph.json` and `INDEX.md`. Normally called automatically after `kb compile`, but can be run standalone after manual wiki edits (e.g., editing in Obsidian).

### `kb query <question>`

Ask a question against the KB. The LLM reads `INDEX.md` to find relevant articles, reads them, and synthesizes an answer with citations.

```bash
kb query "What are the tradeoffs between WebSocket and SSE?"
kb query "What auth flow should I use for a mobile app?"
kb query "What are the tradeoffs between WebSocket and SSE?" --save
```

The `--save` flag is key: it writes the answer as a new wiki article. A comparison you asked for, an analysis, a synthesis across multiple articles — these are valuable and shouldn't disappear into terminal history. This way explorations compound in the knowledge base just like ingested sources do.

When `--save` is used:
1. LLM generates the answer as a full wiki article with frontmatter
2. Saves to `wiki/<derived-slug>.md`
3. Adds source references (the KB articles it drew from) to the frontmatter
4. Runs `kb index` to update the graph
5. Appends a query entry to `log.md`

### `kb status`

Check KB health and staleness.

```bash
kb status                     # Overview of all topics
kb status websocket-vs-sse    # Detailed status of one topic
```

Reports:
- Topics with raw sources but no compiled article (pending compilation)
- Articles where sourceHash is stale (raw sources changed)
- Articles flagged as potentially stale by dependency propagation
- Articles that haven't been updated in a configurable period
- Orphaned articles (no raw sources)
- Graph health (disconnected nodes, empty categories)

### `kb lint`

Validate KB structure and content quality. Has two modes: structural (fast, deterministic) and semantic (uses LLM).

```bash
kb lint                       # Structural lint only (default)
kb lint --semantic             # Include LLM-powered semantic checks
kb lint websocket-vs-sse      # Lint specific article
```

Structural checks (deterministic):
- Broken internal links between articles
- `graph.json` consistency (nodes match wiki files, edges are valid)
- Articles without summaries or tags in frontmatter
- Missing `INDEX.md` entries
- Orphan pages with no inbound links from other articles
- Structural issues (missing frontmatter, etc.)

Semantic checks (LLM-powered, `--semantic`):
- Contradictions between articles (e.g., article A claims X, article B claims the opposite)
- Stale claims that newer sources or articles have superseded
- Important concepts mentioned across articles but lacking their own dedicated page
- Missing cross-references (articles that should link to each other but don't)
- Data gaps that could be filled with additional research
- Suggestions for new topics to investigate based on patterns in existing articles

Semantic lint results are written to `wiki/_lint-report.md` for review and appended to `log.md`.

### `kb serve`

Launch a local Docus dev server for the KB site.

```bash
kb serve                      # Start local dev server
```

Requires Docus to be configured (`kb init --with-site` or manual setup).

## Wiki Article Format

Each compiled article follows a consistent structure:

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

Article content here...

## Related

- [HTTP/2 Streams](http2-streams.md) — HTTP/2's multiplexed streams as an alternative
- [gRPC Basics](grpc-basics.md) — Uses HTTP/2 streams for bidirectional RPC

## References

- [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [HTML Spec: Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
```

The "Related" section is key — these internal links are parsed by `kb index` to build dependency edges in `graph.json`. The LLM generates these during compilation based on existing articles in the KB.

## INDEX.md Format

Generated from `graph.json`. Structured by categories for human browsing and agent navigation.

```markdown
# Knowledge Base Index

> Auto-generated by `kb index`. Do not edit manually.
> Last updated: 2026-04-08

## Networking

Network protocols, real-time communication, and transport layers.

| Topic | Summary | Tags | Updated |
|-------|---------|------|---------|
| [WebSocket vs SSE](wiki/websocket-vs-sse.md) | Comparison of WebSocket and SSE for real-time communication | networking, real-time | 2026-04-08 |
| [HTTP/2 Streams](wiki/http2-streams.md) | Multiplexed streams in HTTP/2 and their use cases | networking, http2 | 2026-03-20 |

## Auth

Authentication, authorization, and identity management.

| Topic | Summary | Tags | Updated |
|-------|---------|------|---------|
| [OAuth2 Flows](wiki/oauth2-flows.md) | Overview of OAuth2 grant types and when to use each | auth, oauth | 2026-03-15 |
| [JWT Tokens](wiki/jwt-tokens.md) | Structure, signing, and validation of JSON Web Tokens | auth, jwt | 2026-03-10 |
```

This mirrors RPG's "Search-then-Zoom" pattern: an agent reads INDEX.md (broad topology), finds the relevant category, then navigates to the specific article.

## Activity Log — `log.md`

An append-only chronological record of KB activity. Every significant operation is logged: ingests, compilations, queries, lint passes. This gives the team a timeline of the KB's evolution and helps the LLM understand recent context.

```markdown
# Activity Log

> Append-only. Each entry is added by `kb` commands automatically.

## [2026-04-08] ingest | websocket-vs-sse
Added 2 raw sources: mdn-notes.md, rfc-comparison.md

## [2026-04-08] compile | websocket-vs-sse
Compiled from 2 raw sources. New article created. Category: Networking.
Updated related articles: http2-streams (added backlink).

## [2026-04-08] query | "WebSocket vs SSE tradeoffs for mobile"
Answered from: websocket-vs-sse, http2-streams. Saved as wiki/websocket-sse-mobile-tradeoffs.md.

## [2026-04-07] lint --semantic
Found: 1 contradiction (jwt-tokens vs session-management on token expiry), 2 missing cross-references, 1 suggested new topic (CORS and preflight requests). Report: wiki/_lint-report.md.

## [2026-04-01] compile
Incremental: 3 topics recompiled (sourceHash mismatch), 12 unchanged, 1 new.
```

The consistent prefix format (`## [date] verb | subject`) makes the log parseable with simple tools: `grep "^## \[" log.md | tail -10` gives the last 10 entries.

## Rollout — Phase 1: GitHub Action Automation

Phase 1 keeps `kb` as a local CLI authoring tool and moves compile/index orchestration into GitHub Actions. No server, no web app — the KB repo itself is the runtime. This removes per-author model/prompt drift, makes wiki updates reviewable as PR diffs, and avoids the complexity of a webhook service until there is real demand for it.

### Goals

- Changes to `raw/` arrive as PRs; `wiki/` is produced and committed by Actions, not by individual machines.
- A single execution environment eliminates variance between contributors' local LLM setups.
- Reviewers see the `raw/` diff and the resulting `wiki/` diff side-by-side before merge (human-in-the-loop, Karpathy-style).

### Components

1. **`kb` CLI** — unchanged from the rest of this spec. Used locally for `ingest`, `query`, and Obsidian-based authoring.
2. **`.github/workflows/compile.yml`** — on push to `main` touching `raw/**`, runs `kb compile && kb index` via Claude Code Action and commits the resulting `wiki/`, `graph.json`, and `INDEX.md` as a bot commit.
3. **`.github/workflows/preview.yml`** — on pull requests touching `raw/**`, runs the same commands in a throwaway workspace and posts the `wiki/` diff as a PR comment. Nothing is committed.
4. **`.github/workflows/lint.yml`** — runs `kb lint` (structural) on every PR. `kb lint --semantic` runs on a nightly schedule and opens an issue when findings exist, keeping LLM cost predictable.

### Trigger Matrix

| Event | Workflow | Action |
|---|---|---|
| `push` to `main` (raw/** changed) | compile.yml | `kb compile` → bot commits updated wiki |
| `pull_request` (raw/** changed) | preview.yml | `kb compile` → wiki diff as PR comment |
| `pull_request` (any) | lint.yml | `kb lint` structural checks |
| `schedule` (nightly) | lint.yml | `kb lint --semantic` → opens issue on findings |

### Design Decisions

- **Direct commits vs bot-opens-PR** — Phase 1 commits directly to `main` from the bot for simplicity. When team size or review load justifies it, switch to a "bot opens a PR with the compiled wiki" model. Tracked as a Phase 2 transition point.
- **Concurrency** — all compile workflows share `concurrency: kb-compile` to serialize writes and avoid `graph.json` races.
- **Secrets** — `ANTHROPIC_API_KEY` is a repository secret. Preview workflows do not run on forked PRs to prevent secret exposure; forks get a manual "run preview" affordance instead.
- **Cost guard** — `kb compile` is incremental by default, so steady-state cost is low. `kb compile --full` is only exposed via `workflow_dispatch` to prevent accidental full rebuilds.
- **CLI parity** — Actions invoke the exact same `kb` binary contributors run locally. No server-side reimplementation of compile logic.

### Out of Scope for Phase 1

- Web chat UI — deferred to Phase 3, after Docus + MCP validates real demand for conversational access.
- Webhook service or real-time compilation — unnecessary complexity for a CI-shaped workload.
- External notification channels (Slack, email) for staleness — Phase 2.

### Exit Criteria → Phase 2

- Every merged `raw/` PR produces a consistent wiki update with zero manual intervention.
- Monthly Actions + LLM cost is measured and within an agreed budget.
- At least one contributor has landed a KB change end-to-end via PR only, without running the CLI locally.

## Integration with Docus

The KB repo can optionally be deployed as a documentation site using [Docus](https://docus.dev). This provides:

- **Full-text search** — Built-in search across all wiki articles
- **Web access** — Team members browse KB without cloning the repo
- **LLMs integration** — Docus generates `llms.txt` and `llms-full.txt` automatically, making the KB site discoverable by AI tools
- **MCP server** — Docus's native MCP server lets AI tools query the KB directly

### Setup

```bash
kb init my-team-kb --with-site    # Scaffolds Docus config alongside KB structure
```

This generates a `nuxt.config.ts` that points Docus at the `wiki/` directory. The site reads directly from the wiki markdown files — no content duplication.

### Deployment

Deploy to any static host (Cloudflare Pages, Vercel, Netlify):

```bash
cd my-team-kb
bun run build          # Builds the Docus site
```

The KB site becomes a fourth consumption channel alongside Obsidian, ASK, and direct git access.

## Integration with ASK

KB articles are consumed by projects through ASK's existing GitHub source adapter:

```bash
# In a project — pull a specific KB article
ask docs add github:my-org/team-kb --docs-path wiki/websocket-vs-sse.md

# Pull all KB articles
ask docs add github:my-org/team-kb --docs-path wiki/

# Keep in sync
ask docs sync
```

ASK handles storing the documents locally, generating skills, and updating AGENTS.md. The KB tool does not need to know about ASK.

## Integration with Obsidian

The KB repo is a valid Obsidian vault. Open the repo root in Obsidian to browse and search articles with graph view. All links use standard markdown link syntax (`[text](path.md)`) for maximum compatibility.

Obsidian's graph view and `graph.json` represent the same relationships from different angles — Obsidian derives its graph from markdown links, `graph.json` adds sourceHash, categories, and semantic features on top.

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
    "warnAfterDays": 90,
    "checkUrls": false
  },
  "compile": {
    "systemPrompt": null,
    "articleTemplate": null
  },
  "site": {
    "enabled": false,
    "title": "Team KB",
    "url": null
  }
}
```

## LLM Delegation Model

`kb` follows the same architectural principle as ASK: the CLI orchestrates, but LLMs do the heavy lifting. Specifically:

- **Compilation** — Raw sources → LLM → structured wiki article with frontmatter, related links, and references
- **Query** — LLM reads INDEX.md to find relevant articles, reads them, synthesizes an answer. With `--save`, produces a full wiki article.
- **Category clustering** — During `kb index`, LLM groups articles into semantic categories for the graph
- **Index generation** — Deterministic: reads `graph.json`, writes `INDEX.md`
- **Structural linting** — Deterministic: broken links, missing frontmatter, graph consistency
- **Semantic linting** — LLM-powered: contradictions, stale claims, orphan concepts, missing cross-references, suggested new topics
- **Staleness** — Date/hash comparison is deterministic; optionally an LLM can check if content is still accurate

The compilation prompt instructs the LLM to:
1. Synthesize all raw sources into a coherent article
2. Resolve contradictions between sources (prefer more recent)
3. Add frontmatter (title, summary, tags, dates, source references)
4. Use clear structure with headings
5. Add a "Related" section linking to relevant existing KB articles
6. Preserve links to original references

## Tech Stack

| Category | Technology |
|---|---|
| Runtime | Node.js (Pure ESM) |
| Language | TypeScript |
| CLI framework | citty (unjs) |
| Logging | consola |
| LLM | Anthropic SDK (default), extensible |
| Site | Docus (optional) |
| Package manager | bun |

## Open Questions

1. **Multiple KB repos** — Should `kb` support linking multiple KB repos (e.g., team KB + personal KB)? Or keep it single-repo for simplicity?
2. **Conflict resolution** — When two people compile the same topic concurrently, git handles file conflicts. Is that sufficient, or do we need article-level merge logic?
3. **Image handling** — How to handle images referenced in raw sources? Copy to repo, or external links only?
4. **CI integration** — Should we ship a GitHub Action for automated staleness checks, lint, and incremental compilation on push?
5. **Category depth** — Should categories support nesting (subcategories)? RPG uses multi-level hierarchy, but flat categories may be simpler to start.

## References

- [Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — The pattern for building personal knowledge bases using LLMs. Foundational inspiration for `kb`'s three-layer architecture (raw → wiki → schema), query-save loop, and lint operations.
- [RPG: A Repository Planning Graph](https://arxiv.org/abs/2509.16198) (ICLR 2026) — Graph representation for code repositories; foundational design for `graph.json`
- [RPG-Encoder: Closing the Loop](https://arxiv.org/abs/2602.02084) — Incremental encoding, agent navigation interface (SearchNode/FetchNode/ExploreRPG)
- [ASK Nuxt UI Evals](https://github.com/pleaseai/ask/tree/main/evals/nuxt-ui) — Evidence that structured docs outperform unstructured dumps for AI agents
- [Docus](https://docus.dev) — Markdown documentation site generator with built-in search and LLMs integration

## Related Projects

- [@pleaseai/ask](https://github.com/pleaseai/ask) — Downloads version-specific library docs and generates AGENTS.md + Claude Code skills for AI agents. Consumes KB articles via its GitHub source adapter.
- [@pleaseai/soop](https://github.com/pleaseai/soop) — TypeScript implementation of RPG/RPG-Encoder for repository understanding and generation. `kb`'s `graph.json` design is directly inspired by soop's RPG graph structure; future integration could reuse soop's graph primitives (`@pleaseai/soop-graph`) and navigation tools (SearchNode, FetchNode, ExploreRPG) for KB navigation.
