import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runInit } from '../src/commands/init'
import {
  findConfigFile,
  KbConfigNotFoundError,
  loadConfig,
} from '../src/config/load'

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'kb-config-'))
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('findConfigFile', () => {
  it('locates kb.config.json in cwd', async () => {
    await runInit({ cwd: workDir })
    expect(findConfigFile(workDir)).toBe(join(workDir, 'kb.config.json'))
  })

  it('walks up to find kb.config.json in an ancestor', async () => {
    await runInit({ cwd: workDir })
    const nested = join(workDir, 'raw', 'topic')
    await mkdir(nested, { recursive: true })
    expect(findConfigFile(nested)).toBe(join(workDir, 'kb.config.json'))
  })

  it('returns null when no config exists in any ancestor', () => {
    expect(findConfigFile(workDir)).toBe(null)
  })
})

describe('loadConfig', () => {
  it('loads and validates a freshly initialized config', async () => {
    await runInit({ cwd: workDir })
    const result = await loadConfig(workDir)
    expect(result.rootDir).toBe(workDir)
    expect(result.config.version).toBe(1)
    expect(result.config.llm.model).toContain('/')
  })

  it('throws KbConfigNotFoundError when no config is present', async () => {
    await expect(loadConfig(workDir)).rejects.toBeInstanceOf(
      KbConfigNotFoundError,
    )
  })

  it('rejects an empty model id', async () => {
    await writeFile(
      join(workDir, 'kb.config.json'),
      JSON.stringify({ version: 1, llm: { model: '' } }),
    )
    await expect(loadConfig(workDir)).rejects.toThrow()
  })

  it('merges defaults so partial configs still validate', async () => {
    await writeFile(
      join(workDir, 'kb.config.json'),
      JSON.stringify({ version: 1 }),
    )
    const { config } = await loadConfig(workDir)
    expect(config.llm.model).toBe('anthropic/claude-sonnet-4-20250514')
    expect(config.staleness.warnAfterDays).toBe(90)
  })

  it('does not throw on unknown top-level keys (warns instead)', async () => {
    await writeFile(
      join(workDir, 'kb.config.json'),
      JSON.stringify({ version: 1, somethingExtra: true }),
    )
    const { config } = await loadConfig(workDir)
    expect(config.version).toBe(1)
  })
})
