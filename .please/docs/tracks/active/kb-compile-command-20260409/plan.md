# Plan — `kb compile` command

## Context

`kb compile` is the LLM-powered core of kb: it reads `raw/<topic>/` sources and produces structured `wiki/<topic>.md` articles. Per SPEC.md it must be **incremental by default** — only recompile topics whose raw sources have changed (sourceHash mismatch against `graph.json`).

Two sub-problems benefit directly from porting logic out of `vendor/gbrain`:

1. **Hash-based idempotent import** — gbrain's `src/core/import-file.ts` uses SHA-256 content_hash for skip-unchanged semantics. kb's `sourceHash` concept is 1:1 compatible.
2. **Chunking** — gbrain's `src/core/chunkers/` (recursive, semantic, llm-guided) is engine-agnostic. kb needs chunking for compile input windowing and (later) query embeddings. Start with recursive; semantic/LLM-guided are optional follow-ups.

## Architecture

```
packages/kb/src/commands/compile/
  index.ts              # citty command definition + flag parsing
  pipeline.ts           # orchestrator: plan → execute → index
  planner.ts            # hash raw/, diff against graph.json, emit ChangeSet
  executor.ts           # per-topic: load sources → chunk → LLM → write wiki/
  llm.ts                # Anthropic SDK call + prompt template
  writer.ts             # wiki/<topic>.md writer with frontmatter merge
  types.ts              # ChangeSet, CompileTask, CompileResult

packages/kb/src/core/
  hash.ts               # sha256 of file content + stable sort (ported from gbrain)
  chunkers/
    recursive.ts        # ported from vendor/gbrain/src/core/chunkers/recursive.ts
    types.ts            # Chunk, ChunkerOptions
```

Wire `compile` into `src/cli.ts` alongside `init`, `ingest`, `status`.

## Tasks

### Phase 1 — Hashing & change detection

- [ ] **T-001** Port `sha256File()` + stable directory hash from `vendor/gbrain/src/core/import-file.ts` into `core/hash.ts` (TDD)
- [ ] **T-002** Implement `planner.ts`: scan `raw/`, compute per-topic sourceHash, diff against `graph.json`, emit `ChangeSet { added, modified, deleted }` (TDD with temp fixture KB)
- [ ] **T-003** Add `--dry-run` flag that prints the ChangeSet without compiling

### Phase 2 — Chunking

- [ ] **T-004** Port `recursive` chunker from `vendor/gbrain/src/core/chunkers/recursive.ts` into `core/chunkers/recursive.ts`, adapting types to kb's pure-module style (TDD — port gbrain's existing test vectors)
- [ ] **T-005** Define `Chunker` interface + options; dispatch defaults to recursive

### Phase 3 — LLM compilation

- [ ] **T-006** Prompt template for raw → wiki article (frontmatter + body + Related section) per SPEC §"LLM Delegation Model"
- [ ] **T-007** `executor.ts`: load sources → chunk → call Anthropic SDK → parse response → write `wiki/<topic>.md` via `writer.ts` (TDD with mocked LLM)
- [ ] **T-008** Frontmatter merge: preserve `created`, bump `updated`, update `sources[]` + `sourceHash`

### Phase 4 — Integration

- [ ] **T-009** Wire `compile` into `cli.ts` with flags: `[topic]`, `--full`, `--dry-run`
- [ ] **T-010** Post-compile hook: invoke `kb index` (existing graph.json rebuilder) to refresh nodes/edges
- [ ] **T-011** Append compile entries to `log.md` (`## [date] compile | <topic>` format)
- [ ] **T-012** End-to-end test: temp KB → ingest → compile → assert wiki/ output + graph.json sourceHash match
- [ ] **T-013** Update `README.md` and CLI `--help`

## gbrain References

Direct code to port (MIT-licensed, compatible):

| gbrain file | kb target | Notes |
|---|---|---|
| `src/core/import-file.ts` (hash logic) | `core/hash.ts` | Extract sha256 + stable-sort only; drop Postgres bits |
| `src/core/chunkers/recursive.ts` | `core/chunkers/recursive.ts` | 5-level delimiter, sentence-aware overlap |
| `test/chunkers/recursive.test.ts` | `test/core/chunkers/recursive.test.ts` | Port test vectors |

Deferred (future tracks):
- Semantic chunker (`vendor/gbrain/src/core/chunkers/semantic.ts`) — needs embeddings
- LLM-guided chunker — cost-sensitive
- Hybrid search (`src/core/search/`) — belongs to future `kb query` embedding track

## Testing Strategy

- Vitest unit tests per module (planner, hash, chunker, executor with mocked LLM)
- Integration test: temp KB fixture with 3 topics; modify one, compile, assert only that topic was recompiled
- Golden test for chunker: port gbrain's existing vectors verbatim to prove fidelity
- Coverage target: >80% for `src/commands/compile/**` and `src/core/chunkers/**`

## Risks

- **LLM nondeterminism in tests** — mock the Anthropic SDK in unit/integration tests; gate real-LLM tests behind `KB_LIVE_LLM=1`
- **Graph race with concurrent compiles** — scope out of this track; SPEC Phase 1 uses GitHub Actions `concurrency: kb-compile` to serialize
- **Chunker port drift** — keep `core/chunkers/recursive.ts` interface-compatible with gbrain's so future updates can be pulled forward mechanically

## Out of Scope

- Embedding generation and vector storage (future `kb query --embed` track)
- Semantic / LLM-guided chunkers (follow-up tracks)
- `kb compile --full` cost guards beyond the existing SPEC design
