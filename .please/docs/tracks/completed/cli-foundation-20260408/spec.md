# Spec: CLI Foundation & Core Infrastructure

## Overview

Set up the foundational CLI structure for `@pleaseai/kb` — the entry point, command routing, configuration loading, and the `kb init` command that scaffolds new knowledge base repositories.

## User Stories

### US-1: Initialize a Knowledge Base

As a developer, I want to run `kb init [directory]` so that a new KB repository is scaffolded with the correct directory structure and configuration.

**Acceptance Criteria:**
- `kb init` creates the KB structure in the current directory
- `kb init my-kb` creates a new directory and scaffolds inside it
- `kb init --with-site` additionally scaffolds Docus configuration
- Created structure matches the spec: `raw/`, `wiki/`, `graph.json`, `INDEX.md`, `log.md`, `kb.config.json`
- If the directory already contains a `kb.config.json`, the command exits with an error

### US-2: CLI Entry Point

As a developer, I want a `kb` command that routes to subcommands so that all KB operations are accessible from a single CLI tool.

**Acceptance Criteria:**
- `kb` with no args shows help
- `kb --version` shows the package version
- `kb <unknown>` shows a helpful error with available commands
- CLI uses citty for command routing
- Logging uses consola

### US-3: Configuration Loading

As a developer, I want `kb` to load `kb.config.json` from the KB root so that commands can access project-level settings (LLM provider, staleness thresholds, etc.).

**Acceptance Criteria:**
- Commands that operate on a KB find and load `kb.config.json` from the current or ancestor directory
- Missing config in commands that need it produces a clear error: "No kb.config.json found. Run `kb init` first."
- Config schema is validated; unknown keys produce warnings, not errors

## Technical Notes

- Package: `packages/kb`
- CLI framework: citty (unjs)
- Logging: consola
- Config format: JSON with a `version` field for future migrations
- Pure ESM, TypeScript

## Out of Scope

- LLM integration (no `compile`, `query`, or semantic `lint` in this track)
- Knowledge graph operations
- Docus site serving
