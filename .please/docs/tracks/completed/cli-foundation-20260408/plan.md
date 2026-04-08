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

- [x] **T-001**: Add runtime deps and build tooling
  - Add `citty`, `consola`, `zod`, `defu`, `pathe` to `packages/kb` deps
  - Add `unbuild`, `vitest` to devDeps
  - Add `build.config.ts` (unbuild entries: `src/index`, `src/cli`)
  - Wire `package.json` scripts: `build`, `dev`, `test`
  - Verify `bun run build` produces `dist/cli.mjs` and `dist/index.mjs`

- [x] **T-002**: CLI entry point (US-2)
  - Create `src/cli.ts` with citty `defineCommand` root command
  - Register `init` subcommand (stub for now — implemented in T-004)
  - `kb --version` reads version from `package.json` at build time
  - `kb` (no args) shows help via citty default
  - Unknown subcommand surfaces a consola error listing available commands
  - Add shebang `#!/usr/bin/env node` to the built CLI

- [x] **T-003**: Config schema and loader (US-3)
  - `src/config/schema.ts`: zod schema matching SPEC.md §Configuration (version, llm, staleness, compile, site)
  - `src/config/defaults.ts`: default config values
  - `src/config/load.ts`: walk from cwd up to filesystem root looking for `kb.config.json`; validate with zod; warn on unknown keys via consola; return `{ config, rootDir }`
  - `src/config/load.ts` throws a typed `KbConfigNotFoundError` when no config is found (commands decide whether to call it)
  - Tests: found in cwd, found in ancestor, not found, invalid schema, unknown key warning

- [x] **T-004**: `kb init` command (US-1)
  - `src/commands/init.ts`: citty subcommand with positional `[directory]` and `--with-site` flag
  - Target dir resolves to `cwd` if no arg, else `path.resolve(cwd, arg)`
  - Creates `raw/`, `wiki/`, `kb.config.json`, `graph.json` (empty graph stub), `INDEX.md` (header-only stub), `log.md` (header-only stub), `.gitignore`
  - `--with-site` additionally writes `nuxt.config.ts` stub pointing at `wiki/`
  - Pre-flight: if target already contains `kb.config.json`, exit with consola error and non-zero code
  - Templates live as string constants in `src/commands/init/templates.ts`
  - Tests: init in empty dir, init with new subdir, init with `--with-site`, init refuses when config exists

- [x] **T-005**: Package entry exports
  - `src/index.ts` re-exports: config schema type, `loadConfig`, `KbConfigNotFoundError`, default config
  - Ensures downstream tracks (graph, compile) can import from `@pleaseai/kb` as a library, not just a CLI

- [x] **T-006**: End-to-end smoke test
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

- Tasks: 6/6 complete
- Last updated: 2026-04-08

## Decision Log

- **2026-04-08** — Chose unbuild over tsup: matches the unjs ecosystem already mandated by spec (citty, consola) and produces the exact output shape `package.json` declares. No config-tuning burden.
- **2026-04-08** — In-house config loader instead of `find-up`: the ancestor walk is ~20 LOC and avoids a transitive dep for a trivial algorithm. Easier to test.
- **2026-04-08** — Docus package NOT installed in this track; `--with-site` only scaffolds a stub `nuxt.config.ts`. Full Docus integration is a separate later track to keep this one shippable.

## Surprises & Discoveries

- **Zod 4 default behavior with required object children**: `.default({})` does not work on `z.object({ required: ... })` because TS infers `{}` as missing required props. Solution: drop `.default` from outer wrappers and let `defu` merge full defaults before `parse()`. Cleaner anyway — defaults live in one place (`defaults.ts`).
- **`resolveLanguageModel` is internal to `ai`**: not exported from `ai` or `ai/internal`. The user pointed at the upstream source file but it's deliberately not part of the public API. AI SDK v6 accepts string model ids on `generateText({ model: 'anthropic/...' })` directly, calling `resolveLanguageModel` internally — so we don't need to depend on it. This let us drop all `@ai-sdk/*` deps from this track.
- **citty `--version` works automatically** from `meta.version` — no manual `--version` handler needed.

## Outcomes & Retrospective

### What Was Shipped

A working `kb` CLI with `kb init` (scaffold a new KB), a typed config loader (ancestor walk + zod + defu defaults), and a library API surface (`loadConfig`, `KbConfigSchema`, `runInit`, defaults, `KbConfigNotFoundError`). 13 vitest tests cover config and init end-to-end against per-test tempdirs. unbuild produces dual ESM + d.mts artifacts matching the existing `package.json` exports declaration.

### What Went Well

- **Scope discipline**: kept LLM integration fully out of scope. The `model` field is just a validated string — no AI SDK deps shipped in this foundation track.
- **Test architecture**: every test uses a fresh `mkdtemp` directory, so init and loadConfig are exercised end-to-end without mocking `node:fs`. Made the e2e gate (T-006) almost free.
- **Library + CLI separation**: `runInit` is a pure function the citty handler wraps, making it directly callable from tests and from any future programmatic consumer.
- **defu + zod combo**: partial configs auto-merge with defaults before validation — users can write a one-line `kb.config.json` and it still parses.

### What Could Improve

- **LSP diagnostics churn**: stale TS diagnostics from the editor caused several false-alarm fix attempts before falling back to `bun run typecheck` as the source of truth. Lesson: trust `tsc`, not the streaming LSP feedback.
- **Dependency thrash**: AI SDK deps were added then removed twice as the design clarified ("provider format → gateway → no deps at all"). Could have been avoided by deciding the scope boundary up front.
- **Branch hygiene**: an unrelated `release-please` commit landed on the branch between the two feature commits. Worth a `.git/hooks` check or branch protection to avoid future cross-contamination.

### Tech Debt Created

- **Nested unknown-key warnings**: `loadConfig` warns only on top-level unknown keys. Nested unknowns (e.g. `llm.unknownField`) silently pass. Acceptable per spec but worth revisiting if config evolves.
- **No JSON parse error wrapping**: a malformed `kb.config.json` surfaces the raw `JSON.parse` error. Wrapping with file path + suggestion would be friendlier.
- **`tsconfig.tsbuildinfo` not in `.gitignore`** before this track — added in this PR but pre-existing repos may have stray copies.
