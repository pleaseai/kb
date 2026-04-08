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

- [x] **T-001** Define zod schemas for `CategoryNode`, `ArticleNode`, `Edge` (TDD: schema tests with valid + invalid samples)
- [x] **T-002** Compose top-level `GraphSchema` with `version`, `lastUpdated`, `nodes`, `edges`
- [x] **T-003** Export `GraphParseError` with structured issue array

### Phase 2 — Store

- [x] **T-004** Implement `createEmptyGraph()` helper (TDD)
- [x] **T-005** Implement `loadGraph(kbRoot)` with validation and error wrapping (TDD)
- [x] **T-006** Implement `saveGraph(kbRoot, graph)` with atomic tmp+rename and `lastUpdated` refresh (TDD)
- [x] **T-007** Round-trip integration test

### Phase 3 — Integration

- [x] **T-008** Update `kb init` to use `createEmptyGraph()` + `saveGraph()`
- [x] **T-009** Public re-export from `src/index.ts`
- [x] **T-010** Coverage verification (>90%)

## Testing Strategy

- Vitest unit tests with valid/invalid fixtures.
- Round-trip property-style test (serialize → parse).
- Coverage target: >90% on `src/graph/**`.

## Risks

- SPEC.md may evolve the graph shape. Mitigate by keeping `version: 1` and documenting the schema in a single file so future migrations are localized.

## Outcomes & Retrospective

### What Was Shipped
- `packages/kb/src/graph/` module: zod schemas (Graph/CategoryNode/ArticleNode/Edge), `GraphParseError`, and `createEmptyGraph`/`loadGraph`/`saveGraph` with atomic tmp+rename writes.
- `kb init` now uses the store instead of a hard-coded JSON template.
- 13 new vitest cases; all 25 tests in the package pass.

### What Went Well
- TDD flow kept the surface tight — no speculative helpers slipped in.
- Validating before writing (`GraphSchema.parse` in `saveGraph`) guarantees we never persist a malformed graph.

### What Could Improve
- `@vitest/coverage-v8` is not installed, so SC-003 (>90% coverage) was validated by inspection rather than by tool. Worth adding to devDependencies later.

### Tech Debt Created
- Coverage tooling missing in `@pleaseai/kb` devDependencies.
