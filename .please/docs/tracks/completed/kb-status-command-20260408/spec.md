# Spec — `kb status` command

## Problem

Users have no way to inspect the health of a KB repo: how many raw sources exist, how many wiki articles are compiled, which articles are stale (raw source hash changed but wiki not recompiled), or whether `graph.json` is out of sync.

## Goal

Provide a `kb status` CLI command that prints a concise summary of the current KB state and flags staleness/drift so users know when to run `compile` or `index`.

## User Stories

- **US1** — As a user, I can run `kb status` and see counts: `raw/` topics, `raw/` sources, `wiki/` articles, graph nodes.
- **US2** — As a user, I can see which wiki articles are stale (source hash changed since last compile).
- **US3** — As a user, I can see orphaned wiki articles (exist in `wiki/` but not in `graph.json`).
- **US4** — As a user, I can run `kb status --json` to get machine-readable output for CI.

## Functional Requirements

- **FR-001** MUST refuse to run outside a KB repository.
- **FR-002** MUST walk `raw/`, `wiki/`, and parse `graph.json` to compute counts.
- **FR-003** MUST detect stale articles by comparing raw source hashes to graph-recorded hashes.
- **FR-004** MUST detect orphaned wiki files (present on disk, absent from graph).
- **FR-005** MUST support `--json` flag for structured output.
- **FR-006** MUST exit 0 even when staleness is detected (informational, not error); exit 1 only on IO/parse failures.

## Success Criteria

- **SC-001** On a freshly `kb init`'d repo, `kb status` reports zero raw, zero wiki, healthy graph.
- **SC-002** After ingesting a source whose hash changes, `kb status` flags the corresponding wiki as stale.
- **SC-003** `kb status --json` output validates against a zod schema.
- **SC-004** Test coverage >80% for `src/commands/status.ts`.

## Non-Goals

- Fixing staleness (that's `compile`).
- Rebuilding the graph (that's `index`).
- Remote/network checks.

## Dependencies

- `graph.json` schema + reader (Track: kb-graph-schema-20260408).
