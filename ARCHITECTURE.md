# Architecture

> Agent-first architecture document for `@pleaseai/kb` — optimized for AI agent consumption.

## System Overview

**Purpose**: A CLI tool that builds and maintains structured knowledge bases in GitHub repositories — ingesting raw research, compiling it into wiki articles via LLMs, and maintaining a knowledge graph for navigation.

**Primary users**: Engineering teams who need a single source of truth for team knowledge, and AI coding agents that consume structured context via ASK.

**Core workflow**:

1. **Ingest** — Raw research material (files, URLs, clipboard) is collected into `raw/<topic>/` directories in the KB repo
2. **Compile** — LLM reads raw sources and produces structured wiki articles in `wiki/`. Only changed topics are recompiled (incremental, hash-based)
3. **Index** — `graph.json` (knowledge graph) and `INDEX.md` are rebuilt from wiki articles — categories via LLM clustering, dependency edges via markdown link parsing
4. **Consume** — Articles are browsed in Obsidian, deployed as a Docus site, pulled into projects via ASK, or accessed directly via git

**Key constraints**: The KB repo is the single source of truth. The CLI operates on KB repos, not on project-local state. LLMs handle compilation and semantic analysis; deterministic operations (status, structural lint, indexing) work without LLM access.

## Dependency Layers

Dependencies flow downward only. Lower layers must not import upper layers.

```
┌─────────────────────────────────┐
│           CLI Layer             │  citty commands (init, ingest, compile, ...)
├─────────────────────────────────┤
│       Application Layer         │  Orchestration: compile pipeline, query engine
├─────────────────────────────────┤
│         Domain Layer            │  Graph, Article, Config, SourceHash
├─────────────────────────────────┤
│      Infrastructure Layer       │  File system, LLM SDK (Anthropic), URL fetcher
└─────────────────────────────────┘
```

**Invariant**: Domain layer has zero framework dependencies — it defines types, validation logic, and graph operations using only TypeScript primitives.

## Entry Points

For understanding the CLI and command structure:

- `packages/kb/src/index.ts` — Package entry point (library exports)
- `packages/kb/src/cli.ts` — CLI entry point (will be created), citty main command definition

For understanding a KB repository (the data structure `kb` operates on):

- `SPEC.md` — Full product specification including graph schema, article format, and all CLI commands
- `README.md` — User-facing overview with quick start guide

For understanding the project workspace:

- `package.json` — Monorepo root with Bun workspace + catalog
- `turbo.json` — Turborepo task pipeline (build, dev, lint, test, typecheck)
- `eslint.config.ts` — Shared ESLint flat config (`@pleaseai/eslint-config`)

## Module Reference

| Module | Purpose | Key Files | Depends On | Depended By |
|---|---|---|---|---|
| `packages/kb/` | Main CLI package (`@pleaseai/kb`) | `src/index.ts` | — | Published as npm package |

> **Note**: The project is in early setup. The table below shows the **planned** module structure based on `SPEC.md`. Modules will be added as tracks are implemented.

### Planned Modules (within `packages/kb/src/`)

| Module | Purpose | Key Concepts |
|---|---|---|
| `cli/` | citty command definitions | One file per command (`init.ts`, `ingest.ts`, `compile.ts`, etc.) |
| `core/config.ts` | KB configuration loading and validation | Finds `kb.config.json`, validates schema, provides defaults |
| `core/graph.ts` | Knowledge graph operations | `graph.json` read/write, node/edge CRUD, category management |
| `core/article.ts` | Wiki article parsing and generation | Frontmatter extraction, markdown link parsing, article schema |
| `core/hash.ts` | Source hash computation | Incremental compilation detection via content hashing |
| `compile/` | LLM-powered compilation pipeline | Raw → wiki transformation, incremental change detection |
| `query/` | Question answering against KB | INDEX.md navigation, article retrieval, answer synthesis |
| `lint/` | Structural and semantic validation | Broken links, graph consistency, LLM-powered contradiction detection |
| `infra/llm.ts` | LLM provider abstraction | Anthropic SDK wrapper, extensible to other providers |
| `infra/fs.ts` | File system operations | KB directory traversal, file read/write helpers |

## Architecture Invariants

**Three-layer data flow**: Raw sources (`raw/`) → compiled articles (`wiki/`) → knowledge graph (`graph.json`). Data always flows in this direction. `wiki/` articles are derived from `raw/`, and `graph.json` is derived from `wiki/`. Never modify upstream layers based on downstream state.

**Incremental by default**: `kb compile` compares source hashes in `graph.json` against current `raw/` content. Only topics with hash mismatches are recompiled. Full recompilation requires explicit `--full` flag.

**Deterministic operations work offline**: `kb status`, `kb lint` (structural), and `kb index` must work without LLM access. Only `kb compile`, `kb query`, and `kb lint --semantic` require an LLM.

**graph.json is derived, not authored**: The knowledge graph is always rebuilt from wiki articles by `kb index`. Manual edits to `graph.json` will be overwritten. The source of truth for structure is the wiki articles themselves (frontmatter + markdown links).

**Do NOT add project-local state**: `kb` operates on KB repositories, not on the project that consumes KB articles. Consumption is handled by ASK (`ask docs add github:org/kb`). The `kb` CLI should never write files outside the KB repo.

## Cross-Cutting Concerns

**Error handling**: CLI commands exit with code 0 (success), 1 (error), or 2 (lint warnings). Every error message must suggest what to do next (actionable errors). If LLM is unavailable, deterministic operations still work — graceful degradation.

**Logging**: Uses `consola` for structured logging. Default output is concise; `--verbose` flag enables detailed output. Respects `NO_COLOR` environment variable. Status indicators use colors: green=ok, yellow=stale, red=error.

**Testing**: Vitest for unit and integration tests. Target >80% code coverage for new code. TDD workflow: write failing tests first, implement to pass, then refactor. Mock LLM calls in tests; file system operations tested against temp directories.

**Configuration**: `kb.config.json` in the KB repo root. JSON format with a `version` field for future schema migrations. CLI finds config by walking up from the current directory. Missing config produces a clear error suggesting `kb init`.

## Quality Notes

**Well-tested**: (No modules yet — project is in initial setup phase)

**Fragile**: (No fragile areas yet)

**Technical debt**: See `.please/docs/tracks/tech-debt-tracker.md` for tracked items.

---

_Last updated: 2026-04-08_

_Key ADRs: None yet. Use `/standards:adr` to document architectural decisions._
