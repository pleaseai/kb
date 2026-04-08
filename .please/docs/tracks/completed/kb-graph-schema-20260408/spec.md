# Spec — `graph.json` schema and reader/writer

## Problem

`graph.json` is the structural backbone of the KB (per SPEC.md: categories, articles, edges). Without a typed schema and a safe reader/writer, downstream commands (`compile`, `index`, `status`, `query`) cannot operate on it consistently. Today nothing in `packages/kb/src/` defines or loads the graph.

## Goal

Define a zod schema for `graph.json` matching SPEC.md, and provide a small `GraphStore` module that loads, validates, mutates, and persists the graph atomically.

## User Stories

- **US1** — As a contributor, I can import `{ GraphSchema }` from `@pleaseai/kb/graph` to validate a `graph.json` file.
- **US2** — As a contributor, I can call `loadGraph(kbRoot)` to get a validated, typed graph object.
- **US3** — As a contributor, I can call `saveGraph(kbRoot, graph)` to write it back atomically with `version` bumped and `lastUpdated` refreshed.
- **US4** — As a contributor, I get clear zod errors when `graph.json` is malformed.

## Functional Requirements

- **FR-001** MUST define zod schemas for: `Graph`, `CategoryNode`, `ArticleNode`, `Edge` (containment + dependency).
- **FR-002** MUST include `version` (number) and `lastUpdated` (ISO 8601 string) at the top level.
- **FR-003** Articles MUST carry `sourceHash`, `category`, `dependencies` fields.
- **FR-004** `loadGraph()` MUST validate and throw a typed `GraphParseError` on failure.
- **FR-005** `saveGraph()` MUST write atomically (tmp file + rename) and bump `lastUpdated`.
- **FR-006** A `createEmptyGraph()` helper MUST produce a valid empty graph for `kb init`.

## Success Criteria

- **SC-001** Round-trip test: `createEmptyGraph() → saveGraph() → loadGraph()` returns an equivalent object.
- **SC-002** Malformed fixtures under `test/fixtures/bad-graphs/` all produce `GraphParseError` with useful messages.
- **SC-003** Test coverage >90% for `src/graph/**`.
- **SC-004** `kb init` updated to call `createEmptyGraph()` + `saveGraph()` instead of hard-coding a literal.

## Non-Goals

- Graph traversal or query APIs (future).
- Incremental graph updates (handled by `index` command in a later track).
- Migration from older schema versions (not applicable yet — v1 is the first).

## Dependencies

None. This track unblocks `kb-status-command-20260408` and later `compile`/`index`.
