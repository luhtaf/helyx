import { z } from 'zod';
import { NvdCveSchema } from '../nvd/types.js';

const Hit = z.object({
  _id: z.string(),
  _source: z.object({
    original: NvdCveSchema,
  }).passthrough(),
  sort: z.array(z.union([z.string(), z.number(), z.null()])).optional(),
}).passthrough();

export const SearchResponse = z.object({
  pit_id: z.string().optional(),
  took: z.number().optional(),
  timed_out: z.boolean().optional(),
  hits: z.object({
    total: z.object({
      value: z.number(),
      relation: z.string().optional(),
    }).passthrough().optional(),
    hits: z.array(Hit).default([]),
  }).passthrough(),
}).passthrough();

export const PitOpenResponse = z.object({
  id: z.string(),
}).passthrough();

export type SearchResponse = z.infer<typeof SearchResponse>;
export type PitOpenResponse = z.infer<typeof PitOpenResponse>;
export type ElkHit = z.infer<typeof Hit>;
export type ElkSortValue = (string | number | null)[];
