import { z } from 'zod'

/**
 * Zod schemas for `graph.json` — the KB knowledge graph.
 *
 * Shape matches SPEC.md §"Knowledge Graph — `graph.json`".
 * Version 1. Future schema migrations should bump `version` and branch here.
 */

export const CategoryNodeSchema = z.object({
  feature: z.string().min(1),
  children: z.array(z.string()),
}).strict()

const ArticleMetadataSchema = z.object({
  path: z.string().min(1),
  tags: z.array(z.string()),
  created: z.string().min(1),
  updated: z.string().min(1),
  sourceHash: z.string(),
}).strict()

export const ArticleNodeSchema = z.object({
  feature: z.string().min(1),
  category: z.string().min(1),
  dependencies: z.array(z.string()),
  metadata: ArticleMetadataSchema,
}).strict()

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
}).strict()

const NodesSchema = z.object({
  categories: z.record(z.string(), CategoryNodeSchema),
  articles: z.record(z.string(), ArticleNodeSchema),
}).strict()

const EdgesSchema = z.object({
  functional: z.array(EdgeSchema),
  dependency: z.array(EdgeSchema),
}).strict()

export const GraphSchema = z.object({
  version: z.literal(1),
  lastUpdated: z.string().nullable(),
  nodes: NodesSchema,
  edges: EdgesSchema,
}).strict()

export type CategoryNode = z.infer<typeof CategoryNodeSchema>
export type ArticleNode = z.infer<typeof ArticleNodeSchema>
export type Edge = z.infer<typeof EdgeSchema>
export type Graph = z.infer<typeof GraphSchema>
