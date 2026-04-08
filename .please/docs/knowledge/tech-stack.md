# Tech Stack — @pleaseai/kb

## Runtime & Language

| Category | Technology | Version |
|---|---|---|
| Runtime | Node.js (Pure ESM) | 24.x |
| Language | TypeScript | 6.x |
| Package Manager | Bun (workspace + catalog) | 1.3.x |
| Monorepo | Turborepo | 2.9.x |

## Linting & Formatting

| Tool | Details |
|---|---|
| ESLint | 10.x with `@pleaseai/eslint-config` (flat config, based on `@antfu/eslint-config`) |
| Prettier | Not used — ESLint handles formatting |
| Style | 2-space indent, single quotes, no semicolons |

## CLI & Utilities

| Category | Technology |
|---|---|
| CLI Framework | citty (unjs) |
| Logging | consola |

## AI / LLM

| Category | Technology |
|---|---|
| LLM SDK | Anthropic SDK (default, extensible) |
| Default Model | claude-sonnet-4 |

## Testing

| Category | Technology |
|---|---|
| Test Runner | vitest |

## Site (Optional)

| Category | Technology |
|---|---|
| Documentation Site | Docus (Nuxt-based) |
| Deployment | Cloudflare Pages / Vercel / Netlify |

## Project Structure

```
kb/                         # Monorepo root
├── packages/
│   └── kb/                 # Main CLI package (@pleaseai/kb)
│       └── src/
├── package.json            # Bun workspace root with catalog
├── turbo.json              # Turborepo task pipeline
├── eslint.config.ts        # Shared ESLint flat config
└── tsconfig.json           # Root TypeScript config
```
