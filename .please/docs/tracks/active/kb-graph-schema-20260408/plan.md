# Plan — `graph.json` schema + GraphStore

## Architecture

New module `packages/kb/src/graph/`:

```
src/graph/
  schema.ts       # zod schemas: Graph, CategoryNode, ArticleNode, Edge
  store.ts        # loadGraph / saveGraph / createEmptyGraph
  errors.ts       # GraphParseError
  index.ts        # public exports
```

Atomic write: serialize to `graph.json.tmp`, `fs.rename` to `graph.json`. Validation flows through a single `parseGraph(raw)` helper so error paths are unified.

## Tasks

### Phase 1 — Schema

- [ ] **T-001** Define zod schemas for `CategoryNode`, `ArticleNode`, `Edge` (TDD: schema tests with valid + invalid samples)
- [ ] **T-002** Compose top-level `GraphSchema` with `version`, `lastUpdated`, `nodes`, `edges`
- [ ] **T-003** Export `GraphParseError` with structured issue array

### Phase 2 — Store

- [ ] **T-004** Implement `createEmptyGraph()` helper (TDD)
- [ ] **T-005** Implement `loadGraph(kbRoot)` with validation and error wrapping (TDD)
- [ ] **T-006** Implement `saveGraph(kbRoot, graph)` with atomic tmp+rename and `lastUpdated` refresh (TDD)
- [ ] **T-007** Round-trip integration test

### Phase 3 — Integration

- [ ] **T-008** Update `kb init` to use `createEmptyGraph()` + `saveGraph()`
- [ ] **T-009** Public re-export from `src/index.ts`
- [ ] **T-010** Coverage verification (>90%)

## Testing Strategy

- Vitest unit tests with valid/invalid fixtures.
- Round-trip property-style test (serialize → parse).
- Coverage target: >90% on `src/graph/**`.

## Risks

- SPEC.md may evolve the graph shape. Mitigate by keeping `version: 1` and documenting the schema in a single file so future migrations are localized.
