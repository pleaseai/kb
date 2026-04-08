import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import {
  GraphSchema,
  CategoryNodeSchema,
  ArticleNodeSchema,
  EdgeSchema,
  createEmptyGraph,
  loadGraph,
  saveGraph,
  GraphParseError,
  GRAPH_FILENAME,
  type Graph,
} from "../src/graph";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "kb-graph-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("schema", () => {
  it("accepts a valid CategoryNode", () => {
    expect(() =>
      CategoryNodeSchema.parse({ feature: "net", children: ["a", "b"] }),
    ).not.toThrow();
  });

  it("rejects a CategoryNode with empty feature", () => {
    expect(() =>
      CategoryNodeSchema.parse({ feature: "", children: [] }),
    ).toThrow();
  });

  it("accepts a valid ArticleNode", () => {
    expect(() =>
      ArticleNodeSchema.parse({
        feature: "summary",
        category: "networking",
        dependencies: [],
        metadata: {
          path: "wiki/a.md",
          tags: [],
          created: "2026-04-08",
          updated: "2026-04-08",
          sourceHash: "abc",
        },
      }),
    ).not.toThrow();
  });

  it("rejects an ArticleNode missing sourceHash", () => {
    expect(() =>
      ArticleNodeSchema.parse({
        feature: "summary",
        category: "networking",
        dependencies: [],
        metadata: {
          path: "wiki/a.md",
          tags: [],
          created: "2026-04-08",
          updated: "2026-04-08",
        },
      }),
    ).toThrow();
  });

  it("rejects an Edge with empty endpoints", () => {
    expect(() => EdgeSchema.parse({ from: "", to: "x" })).toThrow();
  });

  it("accepts an empty graph via top-level schema", () => {
    expect(() => GraphSchema.parse(createEmptyGraph())).not.toThrow();
  });
});

describe("createEmptyGraph", () => {
  it("returns a valid empty graph", () => {
    const g = createEmptyGraph();
    expect(g.version).toBe(1);
    expect(g.lastUpdated).toBeNull();
    expect(g.nodes.categories).toEqual({});
    expect(g.nodes.articles).toEqual({});
    expect(g.edges.functional).toEqual([]);
    expect(g.edges.dependency).toEqual([]);
  });
});

describe("loadGraph / saveGraph", () => {
  it("saveGraph writes atomically, refreshes lastUpdated, and round-trips through loadGraph", async () => {
    const before = createEmptyGraph();
    const written = await saveGraph(workDir, before);
    expect(written.lastUpdated).not.toBeNull();

    // No stray tmp file left behind
    const entries = await readdir(workDir);
    expect(entries).toContain(GRAPH_FILENAME);
    expect(entries.some((e) => e.endsWith(".tmp"))).toBe(false);

    const loaded = await loadGraph(workDir);
    expect(loaded).toEqual(written);
  });

  it("loadGraph throws GraphParseError on invalid JSON", async () => {
    await writeFile(join(workDir, GRAPH_FILENAME), "{not json", "utf8");
    await expect(loadGraph(workDir)).rejects.toBeInstanceOf(GraphParseError);
  });

  it("loadGraph throws GraphParseError with issues on schema violation", async () => {
    await writeFile(
      join(workDir, GRAPH_FILENAME),
      JSON.stringify({ version: 2, lastUpdated: null, nodes: {}, edges: {} }),
      "utf8",
    );
    const err = await loadGraph(workDir).catch((e) => e);
    expect(err).toBeInstanceOf(GraphParseError);
    expect((err as GraphParseError).issues.length).toBeGreaterThan(0);
    expect((err as GraphParseError).path).toContain(GRAPH_FILENAME);
  });

  it("saveGraph refuses to persist an invalid graph", async () => {
    const bad = { ...createEmptyGraph(), version: 99 } as unknown as Graph;
    await expect(saveGraph(workDir, bad)).rejects.toThrow();
    // Nothing should have been written
    const entries = await readdir(workDir);
    expect(entries).not.toContain(GRAPH_FILENAME);
  });

  it("saveGraph produces human-readable JSON with trailing newline", async () => {
    await saveGraph(workDir, createEmptyGraph());
    const raw = await readFile(join(workDir, GRAPH_FILENAME), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain("\n  \"version\": 1");
  });
});
