import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "pathe";
import { defu } from "defu";
import { consola } from "consola";
import { KbConfigSchema, type KbConfig } from "./schema";
import { DEFAULT_KB_CONFIG } from "./defaults";

export const KB_CONFIG_FILENAME = "kb.config.json";

export class KbConfigNotFoundError extends Error {
  constructor(startDir: string) {
    super(
      `No ${KB_CONFIG_FILENAME} found in ${startDir} or any parent directory. Run \`kb init\` first.`,
    );
    this.name = "KbConfigNotFoundError";
  }
}

export interface LoadedKbConfig {
  config: KbConfig;
  rootDir: string;
  configPath: string;
}

const KNOWN_TOP_LEVEL_KEYS = new Set([
  "version",
  "llm",
  "staleness",
  "compile",
  "site",
]);

/**
 * Walk from `startDir` upward looking for `kb.config.json`.
 * Returns the absolute path of the first match, or null.
 */
export function findConfigFile(startDir: string): string | null {
  let current = resolve(startDir);
  while (true) {
    const candidate = resolve(current, KB_CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Load and validate the KB configuration starting from `cwd`.
 * Throws `KbConfigNotFoundError` if no config file exists in any ancestor.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<LoadedKbConfig> {
  const configPath = findConfigFile(cwd);
  if (!configPath) throw new KbConfigNotFoundError(cwd);

  const raw = await readFile(configPath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const key of Object.keys(parsed as Record<string, unknown>)) {
      if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
        consola.warn(`Unknown key "${key}" in ${KB_CONFIG_FILENAME} — ignored.`);
      }
    }
  }

  const merged = defu(parsed as Partial<KbConfig>, DEFAULT_KB_CONFIG);
  const config = KbConfigSchema.parse(merged);

  return {
    config,
    rootDir: dirname(configPath),
    configPath,
  };
}
