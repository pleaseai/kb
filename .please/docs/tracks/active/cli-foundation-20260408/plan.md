# Plan: CLI Foundation & Core Infrastructure

> Track: cli-foundation-20260408
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: /please:plan
- **Track**: cli-foundation-20260408
- **Issue**: (none)
- **Created**: 2026-04-08
- **Approach**: citty + zod + unbuild, one-shot scaffolder for `kb init`

## Purpose

Deliver the first shippable slice of `@pleaseai/kb`: a working `kb` binary that can bootstrap a new KB repository and load its configuration. Everything downstream (compile, index, query) depends on this foundation.

## Context

`packages/kb` exists as an empty ESM TypeScript package inside a bun + turborepo workspace. It declares a `kb` bin pointing at `dist/cli.mjs` but has no build tooling, no dependencies, and an empty `src/index.ts`. This track wires up the build, authors the CLI skeleton, and implements `kb init` + config loading.

## Architecture Decision

**Build**: `unbuild` — unjs-native, zero-config for the dual ESM + d.mts output already declared in `package.json`. Matches the unjs ecosystem (citty, consola) and avoids hand-rolled tsup configuration.

**CLI framework**: `citty` (per spec). Subcommands live in `src/commands/*.ts` and are registered in `src/cli.ts`. Each command is a pure module — no side effects on import — so commands can be unit-tested without spawning the CLI.

**Config**: `zod` for schema + validation, `defu` for defaults merging, an in-house ancestor-walk loader (no external `find-up` dependency — ~20 LOC). Schema file (`src/config/schema.ts`) is the single source of truth for `kb.config.json` shape and is re-exported from the package entry so downstream tracks can import it.

**Scaffolder**: `kb init` writes a deterministic set of files. Template content lives in `src/commands/init/templates/` as plain strings (not a template engine) to keep the dependency surface small. `--with-site` copies an additional Docus stub (`nuxt.config.ts`) — the Docus package itself is NOT installed in this track (out of scope).

**Testing**: `vitest` — fast, ESM-native, matches the unjs tooling choices. Tests run against a temp directory per test (`fs.mkdtemp`) so init/config behavior is verified end-to-end without mocking `fs`.

**Why not alternatives**:
- `commander`/`yargs` — spec mandates citty.
- `tsup`/`tsdown` — unbuild is the unjs default and produces the exact artifact shape `package.json` already declares.
- Runtime config validation via hand-written guards — zod gives us error messages and TS types for free.

## Tasks

- [ ] **T-001**: Add runtime deps and build tooling
  - Add `citty`, `consola`, `zod`, `defu`, `pathe` to `packages/kb` deps
  - Add `unbuild`, `vitest` to devDeps
  - Add `build.config.ts` (unbuild entries: `src/index`, `src/cli`)
  - Wire `package.json` scripts: `build`, `dev`, `test`
  - Verify `bun run build` produces `dist/cli.mjs` and `dist/index.mjs`

- [ ] **T-002**: CLI entry point (US-2)
  - Create `src/cli.ts` with citty `defineCommand` root command
  - Register `init` subcommand (stub for now — implemented in T-004)
  - `kb --version` reads version from `package.json` at build time
  - `kb` (no args) shows help via citty default
  - Unknown subcommand surfaces a consola error listing available commands
  - Add shebang `#!/usr/bin/env node` to the built CLI

- [ ] **T-003**: Config schema and loader (US-3)
  - `src/config/schema.ts`: zod schema matching SPEC.md §Configuration (version, llm, staleness, compile, site)
  - `src/config/defaults.ts`: default config values
  - `src/config/load.ts`: walk from cwd up to filesystem root looking for `kb.config.json`; validate with zod; warn on unknown keys via consola; return `{ config, rootDir }`
  - `src/config/load.ts` throws a typed `KbConfigNotFoundError` when no config is found (commands decide whether to call it)
  - Tests: found in cwd, found in ancestor, not found, invalid schema, unknown key warning

- [ ] **T-004**: `kb init` command (US-1)
  - `src/commands/init.ts`: citty subcommand with positional `[directory]` and `--with-site` flag
  - Target dir resolves to `cwd` if no arg, else `path.resolve(cwd, arg)`
  - Creates `raw/`, `wiki/`, `kb.config.json`, `graph.json` (empty graph stub), `INDEX.md` (header-only stub), `log.md` (header-only stub), `.gitignore`
  - `--with-site` additionally writes `nuxt.config.ts` stub pointing at `wiki/`
  - Pre-flight: if target already contains `kb.config.json`, exit with consola error and non-zero code
  - Templates live as string constants in `src/commands/init/templates.ts`
  - Tests: init in empty dir, init with new subdir, init with `--with-site`, init refuses when config exists

- [ ] **T-005**: Package entry exports
  - `src/index.ts` re-exports: config schema type, `loadConfig`, `KbConfigNotFoundError`, default config
  - Ensures downstream tracks (graph, compile) can import from `@pleaseai/kb` as a library, not just a CLI

- [ ] **T-006**: End-to-end smoke test
  - Vitest e2e test that spawns the built `dist/cli.mjs` via `node:child_process` in a temp dir, runs `init`, then verifies the scaffolded structure and that `loadConfig` can read it back
  - Guarantees build + CLI + loader actually compose correctly

## Dependencies

```
T-001 ──┬── T-002 ──┐
        │           ├── T-004 ── T-006
        └── T-003 ──┘
                    └── T-005
```

T-001 blocks everything. T-002 and T-003 are parallelizable. T-004 needs both. T-005 needs T-003. T-006 is the final integration gate.

## Key Files

- `packages/kb/package.json` — add deps, scripts, build config reference
- `packages/kb/build.config.ts` — NEW — unbuild entries
- `packages/kb/src/cli.ts` — NEW — citty root command
- `packages/kb/src/index.ts` — MODIFY — library exports
- `packages/kb/src/config/schema.ts` — NEW — zod schema
- `packages/kb/src/config/load.ts` — NEW — ancestor-walk loader
- `packages/kb/src/config/defaults.ts` — NEW
- `packages/kb/src/commands/init.ts` — NEW — `kb init` subcommand
- `packages/kb/src/commands/init/templates.ts` — NEW — file content strings
- `packages/kb/test/config.test.ts` — NEW
- `packages/kb/test/init.test.ts` — NEW
- `packages/kb/test/cli.e2e.test.ts` — NEW

## Verification

Manual:
```bash
bun run --cwd packages/kb build
node packages/kb/dist/cli.mjs --version
mkdir /tmp/kb-smoke && cd /tmp/kb-smoke && node <repo>/packages/kb/dist/cli.mjs init
ls -la  # raw/ wiki/ kb.config.json graph.json INDEX.md log.md .gitignore
node <repo>/packages/kb/dist/cli.mjs init  # should error (config exists)
```

Automated:
```bash
bun run --cwd packages/kb test
bun run --cwd packages/kb typecheck
bun run --cwd packages/kb lint
```

All must pass before marking the track complete.

## Progress

- Tasks: 0/6 complete
- Last updated: 2026-04-08

## Decision Log

- **2026-04-08** — Chose unbuild over tsup: matches the unjs ecosystem already mandated by spec (citty, consola) and produces the exact output shape `package.json` declares. No config-tuning burden.
- **2026-04-08** — In-house config loader instead of `find-up`: the ancestor walk is ~20 LOC and avoids a transitive dep for a trivial algorithm. Easier to test.
- **2026-04-08** — Docus package NOT installed in this track; `--with-site` only scaffolds a stub `nuxt.config.ts`. Full Docus integration is a separate later track to keep this one shippable.

## Surprises & Discoveries

(to be filled during implementation)
