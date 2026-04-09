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

- [x] T001 Port sha256 file + stable topic-dir hash from gbrain into core/hash.ts (file: packages/kb/src/core/hash.ts)
- [x] T002 Implement planner: scan raw/, compute per-topic sourceHash, diff against graph.json, emit ChangeSet (file: packages/kb/src/commands/compile/planner.ts)
- [x] T003 Wire compile command skeleton with --dry-run flag that prints the ChangeSet (file: packages/kb/src/commands/compile/index.ts)

### Phase 2 — Chunking

- [x] T004 Port recursive chunker from gbrain preserving test vectors (file: packages/kb/src/core/chunkers/recursive.ts)
- [x] T005 Define Chunker interface and default dispatcher (file: packages/kb/src/core/chunkers/index.ts)

### Phase 3 — LLM compilation

- [ ] T006 Prompt template for raw-to-wiki compilation per SPEC LLM Delegation Model (file: packages/kb/src/commands/compile/prompt.ts)
- [ ] T007 Executor: load sources, chunk, call Anthropic SDK, parse response, write wiki article (file: packages/kb/src/commands/compile/executor.ts)
- [ ] T008 Frontmatter merge: preserve created, bump updated, update sources and sourceHash (file: packages/kb/src/commands/compile/writer.ts)

### Phase 4 — Integration

- [ ] T009 Wire compile into cli.ts with flags topic, --full, --dry-run (file: packages/kb/src/cli.ts)
- [ ] T010 Post-compile hook invoking kb index to refresh graph.json and INDEX.md (file: packages/kb/src/commands/compile/pipeline.ts)
- [ ] T011 Append compile entries to log.md per SPEC activity log format (file: packages/kb/src/commands/compile/log.ts)
- [ ] T012 End-to-end integration test temp KB ingest compile assert wiki output and sourceHash match (file: packages/kb/test/compile.test.ts)
- [ ] T013 Update README.md usage and CLI --help output (file: packages/kb/README.md)

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
