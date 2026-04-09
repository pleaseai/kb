# Spec — `kb compile` command

## Problem

`kb ingest` lands raw source material in `raw/<topic>/` directories, and `kb index` maintains `graph.json`, but there is no command to turn raw sources into structured wiki articles. The LLM-powered compile step is the missing core of the pipeline described in SPEC.md. Without it, the KB cannot produce `wiki/*.md` and `graph.json` sourceHashes remain empty, which means `kb status` cannot report staleness and `kb query` has nothing to search.

## Goal

Provide a `kb compile` CLI command that reads raw sources per topic, produces/updates structured `wiki/<topic>.md` articles via an LLM, and is **incremental by default** — only recompiling topics whose `sourceHash` no longer matches `graph.json`.

Port two gbrain modules (`vendor/gbrain`, MIT) that directly match this design:

- `src/core/import-file.ts` hash logic → `packages/kb/src/core/hash.ts`
- `src/core/chunkers/recursive.ts` → `packages/kb/src/core/chunkers/recursive.ts`

## User Stories

- **US1** — As a user, I can run `kb compile` to compile every topic whose raw sources have changed since the last run.
- **US2** — As a user, I can run `kb compile <topic>` to force-compile a specific topic regardless of hash state.
- **US3** — As a user, I can run `kb compile --full` to force recompilation of every topic.
- **US4** — As a user, I can run `kb compile --dry-run` to see which topics would be recompiled without calling the LLM.
- **US5** — As a user, every compiled article has a stable `sourceHash` written to both article frontmatter and `graph.json`, enabling incremental reruns.
- **US6** — As a user, each compile run appends an entry to `log.md` describing what was compiled.

## Functional Requirements

- **FR-001** The command MUST compute a stable SHA-256 hash of each topic's raw files (sorted path + content) and compare against `graph.json[articles][<topic>][metadata][sourceHash]`.
- **FR-002** The command MUST skip topics whose hash matches the stored value unless `--full` or an explicit topic argument is passed.
- **FR-003** For changed topics the command MUST call the configured LLM (`kb.config.json` → `llm`) with raw source content and the existing article (if any) to produce an updated article.
- **FR-004** The command MUST write `wiki/<topic>.md` with frontmatter: `title`, `summary`, `tags`, `created` (preserved if existing), `updated` (bumped), `sources[]`, `sourceHash`.
- **FR-005** The command MUST refuse to run outside a KB repository (no `kb.config.json`).
- **FR-006** The command MUST chunk raw input using the recursive chunker ported from gbrain before sending to the LLM, when total input exceeds a configurable token budget.
- **FR-007** After compilation the command MUST invoke `kb index` to rebuild `graph.json` and `INDEX.md`.
- **FR-008** The command MUST append an entry to `log.md` per SPEC §"Activity Log" format: `## [YYYY-MM-DD] compile | <topic>`.
- **FR-009** `--dry-run` MUST print the change set (`added`, `modified`, `deleted`, `unchanged`) and exit 0 without calling the LLM or writing files.
- **FR-010** All user-facing output MUST go through `consola`.
- **FR-011** LLM call failures MUST leave existing `wiki/<topic>.md` untouched and report per-topic errors without aborting the whole batch.

## Success Criteria

- **SC-001** Running `kb compile` on a KB with 3 changed topics and 5 unchanged topics produces exactly 3 wiki article updates; the other 5 are skipped with a "unchanged" log line.
- **SC-002** Running `kb compile --dry-run` produces the same change set as SC-001 without writing any files or invoking the LLM.
- **SC-003** A compiled article's `sourceHash` in frontmatter equals the value written to `graph.json` for that article.
- **SC-004** Re-running `kb compile` immediately after a successful run compiles zero topics.
- **SC-005** Unit + integration tests cover planner, hasher, chunker, executor, and writer with >80% coverage for `src/commands/compile/**` and `src/core/chunkers/**`.
- **SC-006** The ported recursive chunker passes gbrain's existing test vectors verbatim.

## Non-Goals

- Embedding generation and vector storage (future track).
- Semantic and LLM-guided chunkers (future tracks).
- Hybrid search (`gbrain src/core/search/`) — belongs to a future `kb query` track.
- Concurrency / parallel LLM calls across topics (sequential in v1).
- `kb compile --watch` mode.

## References

- SPEC.md §"Incremental Compilation" and §"LLM Delegation Model"
- `vendor/gbrain/src/core/import-file.ts` — hash + idempotent import
- `vendor/gbrain/src/core/chunkers/recursive.ts` + `test/chunkers/recursive.test.ts` — chunker port source
- RPG-Encoder paper (https://arxiv.org/abs/2602.02084) — incremental maintenance protocol
