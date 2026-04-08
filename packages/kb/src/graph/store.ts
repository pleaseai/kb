import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "pathe";
import { GraphSchema, type Graph } from "./schema";
import { GraphParseError } from "./errors";

export const GRAPH_FILENAME = "graph.json";

/**
 * Produce a fresh, empty graph that satisfies GraphSchema.
 * Used by `kb init` and by tests that need a baseline.
 */
export function createEmptyGraph(): Graph {
  return {
    version: 1,
    lastUpdated: null,
    nodes: { categories: {}, articles: {} },
    edges: { functional: [], dependency: [] },
  };
}

function parseGraph(raw: string, path: string): Graph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new GraphParseError(path, [], error);
  }
  const result = GraphSchema.safeParse(parsed);
  if (!result.success) {
    throw new GraphParseError(path, result.error.issues);
  }
  return result.data;
}

/**
 * Load and validate `graph.json` from the given KB root directory.
 * Throws GraphParseError on malformed JSON or schema violations.
 */
export async function loadGraph(kbRoot: string): Promise<Graph> {
  const path = join(kbRoot, GRAPH_FILENAME);
  const raw = await readFile(path, "utf8");
  return parseGraph(raw, path);
}

/**
 * Persist `graph.json` atomically: write to a sibling tmp file then rename.
 * Refreshes `lastUpdated` to the current ISO timestamp before writing.
 * Returns the graph as written (with the refreshed timestamp).
 */
export async function saveGraph(kbRoot: string, graph: Graph): Promise<Graph> {
  const next: Graph = {
    ...graph,
    lastUpdated: new Date().toISOString(),
  };
  // Validate before touching disk so we never persist an invalid graph.
  const validated = GraphSchema.parse(next);

  const finalPath = join(kbRoot, GRAPH_FILENAME);
  const tmpPath = `${finalPath}.tmp`;
  const serialized = `${JSON.stringify(validated, null, 2)}\n`;
  await writeFile(tmpPath, serialized, "utf8");
  await rename(tmpPath, finalPath);
  return validated;
}
