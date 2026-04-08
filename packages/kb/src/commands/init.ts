import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "pathe";
import { defineCommand } from "citty";
import { consola } from "consola";
import {
  GITIGNORE_TEMPLATE,
  INDEX_MD_TEMPLATE,
  KB_CONFIG_TEMPLATE,
  LOG_MD_TEMPLATE,
  NUXT_CONFIG_TEMPLATE,
} from "./init/templates";
import { KB_CONFIG_FILENAME } from "../config/load";
import { createEmptyGraph, saveGraph, GRAPH_FILENAME } from "../graph";

export interface InitOptions {
  directory?: string;
  withSite?: boolean;
  cwd?: string;
}

export interface InitResult {
  rootDir: string;
  createdFiles: string[];
  withSite: boolean;
}

/**
 * Programmatic entry point for `kb init`. Throws on pre-flight failure
 * (target already contains a kb.config.json) so callers can decide how
 * to surface the error.
 */
export async function runInit(options: InitOptions = {}): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const rootDir = options.directory
    ? resolve(cwd, options.directory)
    : resolve(cwd);

  const configPath = join(rootDir, KB_CONFIG_FILENAME);
  if (existsSync(configPath)) {
    throw new Error(
      `${KB_CONFIG_FILENAME} already exists at ${rootDir}. Refusing to overwrite.`,
    );
  }

  await mkdir(join(rootDir, "raw"), { recursive: true });
  await mkdir(join(rootDir, "wiki"), { recursive: true });

  const created: string[] = [];

  const writes: Array<[string, string]> = [
    [KB_CONFIG_FILENAME, KB_CONFIG_TEMPLATE],
    ["INDEX.md", INDEX_MD_TEMPLATE],
    ["log.md", LOG_MD_TEMPLATE],
    [".gitignore", GITIGNORE_TEMPLATE],
  ];

  if (options.withSite) {
    writes.push(["nuxt.config.ts", NUXT_CONFIG_TEMPLATE]);
  }

  for (const [name, content] of writes) {
    const target = join(rootDir, name);
    await writeFile(target, content, "utf8");
    created.push(target);
  }

  await saveGraph(rootDir, createEmptyGraph());
  created.push(join(rootDir, GRAPH_FILENAME));

  return {
    rootDir,
    createdFiles: created,
    withSite: options.withSite ?? false,
  };
}

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Initialize a new knowledge base in the current or named directory",
  },
  args: {
    directory: {
      type: "positional",
      required: false,
      description: "Target directory (created if it does not exist)",
    },
    "with-site": {
      type: "boolean",
      default: false,
      description: "Also scaffold a Docus site configuration",
    },
  },
  async run({ args }) {
    try {
      const result = await runInit({
        directory: args.directory,
        withSite: args["with-site"],
      });
      consola.success(`Initialized KB at ${result.rootDir}`);
      consola.info(`Created ${result.createdFiles.length} files in raw/, wiki/, and root.`);
      if (result.withSite) {
        consola.info("Docus site configuration scaffolded (nuxt.config.ts).");
      }
      consola.info("Next: `kb ingest <topic>` to start collecting sources.");
    } catch (error) {
      consola.error((error as Error).message);
      process.exit(1);
    }
  },
});
