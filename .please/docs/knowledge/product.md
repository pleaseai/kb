# Product Guide — @pleaseai/kb

## Vision

A CLI tool that turns scattered research into a curated, structured knowledge base backed by GitHub. Teams stop re-researching the same topics; AI agents get the structured context they need to perform well.

## Target Users

- **Engineering teams** who repeatedly research the same technologies across projects
- **AI-assisted development teams** who need structured, accurate context for coding agents
- **Knowledge managers** who want a single source of truth for team knowledge

## Core Value Proposition

1. **Research compounds** — Raw notes are compiled into structured wiki articles by LLMs. Queries saved as articles. The KB grows richer with every interaction.
2. **Incremental compilation** — Only recompile what changed. Source hashes make it as efficient as `make`.
3. **Graph-based navigation** — Semantic categories and dependency edges (inspired by RPG/RPG-Encoder) enable AI agents to navigate via "Search → Zoom" pattern.
4. **Four consumption channels** — Obsidian (local), Docus (web), ASK (AI agents), git (raw access).
5. **GitHub is the backend** — No custom infrastructure. Version history, PRs, CI for automation.

## Core Features

| Feature | Description |
|---|---|
| `kb init` | Initialize a new KB repository |
| `kb ingest` | Add raw source material (file, URL, clipboard, interactive) |
| `kb compile` | LLM-powered incremental compilation of raw → wiki articles |
| `kb index` | Rebuild knowledge graph and INDEX.md |
| `kb query` | Ask questions against the KB with optional `--save` |
| `kb status` | Health check and staleness detection |
| `kb lint` | Structural + semantic validation |
| `kb serve` | Local Docus dev server |

## Architecture

Three-layer data flow: `raw/` (unprocessed sources) → `wiki/` (compiled articles) → `graph.json` (knowledge graph)

The knowledge graph (`graph.json`) is the structural backbone — inspired by Microsoft's RPG-Encoder. It tracks categories (semantic groupings), articles (with source hashes), and edges (functional containment + dependency references).

## Non-Goals

- Not a note-taking app (use Obsidian, Notion for drafts)
- Not project-local — operates on the KB repo itself
- Does not generate AGENTS.md or skills (that's ASK's job)
