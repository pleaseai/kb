import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runInit } from '../src/commands/init'

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'kb-init-'))
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('runInit', () => {
  it('scaffolds the standard KB layout in the target directory', async () => {
    const result = await runInit({ cwd: workDir })
    expect(result.rootDir).toBe(workDir)
    expect(result.withSite).toBe(false)

    for (const file of [
      'kb.config.json',
      'graph.json',
      'INDEX.md',
      'log.md',
      '.gitignore',
    ]) {
      const s = await stat(join(workDir, file))
      expect(s.isFile()).toBe(true)
    }
    expect((await stat(join(workDir, 'raw'))).isDirectory()).toBe(true)
    expect((await stat(join(workDir, 'wiki'))).isDirectory()).toBe(true)
  })

  it('creates a new subdirectory when `directory` is given', async () => {
    const result = await runInit({ cwd: workDir, directory: 'my-kb' })
    expect(result.rootDir).toBe(join(workDir, 'my-kb'))
    const s = await stat(join(workDir, 'my-kb', 'kb.config.json'))
    expect(s.isFile()).toBe(true)
  })

  it('scaffolds nuxt.config.ts when withSite is true', async () => {
    await runInit({ cwd: workDir, withSite: true })
    const nuxt = await readFile(join(workDir, 'nuxt.config.ts'), 'utf8')
    expect(nuxt).toContain('defineNuxtConfig')
  })

  it('refuses to overwrite an existing kb.config.json', async () => {
    await runInit({ cwd: workDir })
    await expect(runInit({ cwd: workDir })).rejects.toThrow(/already exists/)
  })

  it('writes a config file with a non-empty model id', async () => {
    await runInit({ cwd: workDir })
    const raw = await readFile(join(workDir, 'kb.config.json'), 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.version).toBe(1)
    expect(typeof parsed.llm.model).toBe('string')
    expect(parsed.llm.model.length).toBeGreaterThan(0)
  })
})
