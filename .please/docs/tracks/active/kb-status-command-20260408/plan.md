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

- [ ] **T-001** Define `StatusReport` zod schema in `types.ts`
- [ ] **T-002** Implement `walkRaw()` to count topics and sources (TDD against fixture KB)
- [ ] **T-003** Implement `walkWiki()` to list wiki files (TDD)
- [ ] **T-004** Implement `detectStale()` comparing raw source hashes to graph-recorded hashes (TDD — depends on graph reader from kb-graph-schema track)
- [ ] **T-005** Implement `detectOrphans()` comparing wiki files to graph nodes (TDD)
- [ ] **T-006** Compose into `analyze(kbRoot)` → `StatusReport`

### Phase 2 — CLI

- [ ] **T-007** Human formatter with consola (colored summary table)
- [ ] **T-008** `--json` flag wiring and schema validation
- [ ] **T-009** Wire `status` command into `cli.ts`
- [ ] **T-010** Integration test: init → ingest → status (depends on ingest track)

## Testing Strategy

- Unit tests per analyzer against small fixture KBs under `test/fixtures/`.
- Integration test covering the happy path.
- Coverage target: >80%.

## Risks

- Depends on graph schema landing first for stale/orphan detection. Can still ship counts-only status if graph track slips.
