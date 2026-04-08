# Plan — `kb ingest` command

## Architecture

Add a new citty sub-command `ingest` under `packages/kb/src/commands/ingest/`. It composes small pure modules for each input mode (`file`, `url`, `clipboard`, `interactive`) behind a shared `Source` interface, then funnels them through a single `writeRawSource()` writer that handles hashing, frontmatter, and dedup.

```
src/commands/ingest/
  index.ts          # citty command definition + flag parsing
  inputs/
    file.ts         # --file mode
    url.ts          # --url mode
    clipboard.ts    # --clipboard mode
    interactive.ts  # TTY prompt mode
  writer.ts         # writeRawSource() — hashing, frontmatter, dedup
  types.ts          # Source, IngestResult
```

Wire `ingest` into `src/cli.ts` alongside `init`.

## Tasks

### Phase 1 — Foundation

- [x] **T-001** Define `Source` + `IngestResult` types in `ingest/types.ts`
- [x] **T-002** Implement `writeRawSource()` writer with sha256 hashing, YAML frontmatter, duplicate detection (RED: unit tests first)
- [x] **T-003** Wire `ingest` command skeleton into `cli.ts` and add citty flag parsing

### Phase 2 — Input modes

- [x] **T-004** `--file` input: read file, detect encoding, construct Source (TDD)
- [x] **T-005** `--url` input: fetch via `fetch`, HTML→markdown conversion (TDD with mocked fetch)
- [x] **T-006** `--clipboard` input: read clipboard via Bun/Node clipboard access (TDD with injectable reader)
- [x] **T-007** Interactive mode: consola prompts for topic + content (TDD with injectable prompter)

### Phase 3 — Integration

- [x] **T-008** KB repo guard: refuse to run without `kb.config.json`
- [x] **T-009** End-to-end integration test covering all four modes against a temp KB
- [x] **T-010** Update `README.md` usage section and add CLI `--help` output

## Testing Strategy

- Vitest unit tests per module, mocking fs/fetch/clipboard/prompter.
- One integration test spinning up a temp KB via `kb init` then running each input mode.
- Coverage target: >80% for `src/commands/ingest/**`.

## Risks

- **Clipboard access across platforms**: fall back to `--file -` (stdin) on unsupported platforms.
- **HTML→markdown fidelity**: use `turndown` or equivalent; accept best-effort conversion.
