import type { Source } from '../types'
import { readFile, stat } from 'node:fs/promises'
import process from 'node:process'
import { basename, resolve } from 'pathe'

export interface FileInputOptions {
  filePath: string
  cwd?: string
}

/**
 * Read a local file and wrap it as a `Source`. Throws if the path does not
 * point to a readable regular file.
 */
export async function readFileSource(
  options: FileInputOptions,
): Promise<Source> {
  const absolute = resolve(options.cwd ?? process.cwd(), options.filePath)

  let info
  try {
    info = await stat(absolute)
  }
  catch {
    throw new Error(`File not found: ${absolute}`)
  }
  if (!info.isFile())
    throw new Error(`Not a regular file: ${absolute}`)

  const content = await readFile(absolute, 'utf8')
  const rawName = basename(absolute)
  const filename = rawName.endsWith('.md') ? rawName : `${rawName}.md`

  return {
    filename,
    content,
    origin: absolute,
  }
}
