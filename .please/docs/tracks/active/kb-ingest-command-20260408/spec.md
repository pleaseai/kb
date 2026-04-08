# Spec — `kb ingest` command

## Problem

After `kb init`, users need a way to add raw source material into `raw/<topic>/` directories. Today there is no entry point into the pipeline, so `compile`/`index` cannot be built or tested against realistic data.

## Goal

Provide a `kb ingest` CLI command that accepts source material from multiple input modes, organizes it under `raw/<topic>/`, and records a source hash per file for later incremental compilation.

## User Stories

- **US1** — As a user, I can run `kb ingest --topic websocket-vs-sse --file notes.md` to copy a local file into `raw/websocket-vs-sse/`.
- **US2** — As a user, I can run `kb ingest --topic oauth2 --url https://example.com/rfc` to fetch a URL and store its contents as a raw source.
- **US3** — As a user, I can run `kb ingest --topic http2 --clipboard` to ingest the current clipboard contents.
- **US4** — As a user, I can run `kb ingest` with no flags to enter an interactive prompt that guides me through topic + source selection.
- **US5** — As a user, every ingested file gets a stable `sourceHash` recorded so `compile` can detect changes later.

## Functional Requirements

- **FR-001** The command MUST create `raw/<topic>/` if it does not exist.
- **FR-002** The command MUST write each source as a markdown file (`.md`), preserving original content and adding YAML frontmatter (`source`, `ingestedAt`, `sourceHash`).
- **FR-003** `--file <path>` input mode MUST accept absolute and relative paths and fail loudly if the file is missing.
- **FR-004** `--url <url>` input mode MUST fetch the URL, detect content type, and convert HTML → markdown when possible.
- **FR-005** `--clipboard` input mode MUST read from the system clipboard.
- **FR-006** Interactive mode MUST be triggered when no input flag is passed AND stdout is a TTY.
- **FR-007** The command MUST refuse to run outside a KB repository (no `kb.config.json` found).
- **FR-008** Duplicate ingestion (same `sourceHash`) MUST be detected and skipped with an informational message.
- **FR-009** All messages MUST be routed through `consola` (no raw `console.log`).

## Success Criteria

- **SC-001** Running `kb ingest --topic demo --file README.md` creates `raw/demo/README.md` with valid frontmatter containing a sha256 `sourceHash`.
- **SC-002** Re-running the same command emits "already ingested" and exits 0.
- **SC-003** `kb ingest` outside a KB repo exits non-zero with a clear error.
- **SC-004** Unit + integration tests cover all four input modes with >80% coverage for `src/commands/ingest.ts`.

## Non-Goals

- LLM compilation of raw → wiki (that's `kb compile`).
- Graph updates (that's `kb index`).
- Multi-file batch ingest in a single invocation (future work).

## Dependencies

- Existing `kb init` command and `kb.config.json` loader.
