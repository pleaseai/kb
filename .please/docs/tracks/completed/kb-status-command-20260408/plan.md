# Plan — `kb status` command

## Architecture

Add `packages/kb/src/commands/status.ts` composed of small pure analyzers:

```
src/commands/status/
  index.ts        # citty command + --json flag
  analyze.ts      # walkKb() → StatusReport (pure, no IO coupling beyond fs)
  format.ts       # human-readable formatter (consola)
  types.ts        # StatusReport zod schema
```

`analyze.ts` takes a KB root path and returns a `StatusReport` object. `format.ts` renders it; `--json` prints the object directly.

## Tasks

### Phase 1 — Analyzer

- [x] T001 Define StatusReport zod schema (file: packages/kb/src/commands/status/types.ts)
- [x] T002 Implement walkRaw() to count topics and sources (file: packages/kb/src/commands/status/analyze.ts)
- [x] T003 Implement walkWiki() to list wiki files (file: packages/kb/src/commands/status/analyze.ts)
- [x] T004 Implement detectStale() comparing raw source hashes to graph-recorded hashes (file: packages/kb/src/commands/status/analyze.ts)
- [x] T005 Implement detectOrphans() comparing wiki files to graph nodes (file: packages/kb/src/commands/status/analyze.ts)
- [x] T006 Compose into analyze(kbRoot) returning StatusReport (file: packages/kb/src/commands/status/analyze.ts)

### Phase 2 — CLI

- [x] T007 Human formatter with consola colored summary (file: packages/kb/src/commands/status/format.ts)
- [x] T008 --json flag wiring and schema validation (file: packages/kb/src/commands/status/index.ts)
- [x] T009 Wire status command into cli.ts (file: packages/kb/src/cli.ts)
- [x] T010 Integration test: init -> ingest -> status (file: packages/kb/test/status.integration.test.ts)

## Testing Strategy

- Unit tests per analyzer against small fixture KBs under `test/fixtures/`.
- Integration test covering the happy path.
- Coverage target: >80%.

## Risks

- Depends on graph schema landing first for stale/orphan detection. Can still ship counts-only status if graph track slips.
