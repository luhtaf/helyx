import { z } from 'zod';

// Spiderfoot ParsedRecord shape — see luhtaf/spiderfoot-fetcher main.go.
// .passthrough() everywhere so newly-added fields don't break us.

const Affected = z.object({
  product: z.string().optional(),
  vendor: z.string().optional(),
  version: z.string().optional(),
}).passthrough();

const Cisa = z.object({
  cisaActionDue: z.string().optional(),
  cisaExploitAdd: z.string().optional(),
  cisaRequiredAction: z.string().optional(),
  cisaVulnerabilityName: z.string().optional(),
}).passthrough();

const Epss = z.object({
  cve: z.string().optional(),
  epss: z.coerce.number().optional(),
  date: z.string().optional(),
}).passthrough();

export const SpiderfootRecord = z.object({
  '@timestamp': z.string().optional(),
  'Scan Name': z.string().optional(),
  Type: z.string(),
  Module: z.string().optional(),
  Source: z.string().optional(),
  Data: z.string().optional(),
  Organisasi: z.string().optional(),
  Sektor: z.string().optional(),
  Subsektor: z.string().optional(),
  Target: z.string().optional(),
  Vulnerability: z.string().optional(),

  // CVE-specific
  Vuln: z.string().optional(),
  Score: z.coerce.number().optional(),
  Severity: z.string().optional(),
  hasCisa: z.boolean().optional(),
  cisa: Cisa.optional(),
  hasEpss: z.boolean().optional(),
  epss: Epss.optional(),
  lastModified: z.string().optional(),
  published: z.string().optional(),
  affected: z.array(Affected).optional(),
}).passthrough();

const Hit = z.object({
  _id: z.string(),
  _source: SpiderfootRecord,
  sort: z.array(z.union([z.string(), z.number(), z.null()])).optional(),
}).passthrough();

export const SpiderfootSearchResponse = z.object({
  pit_id: z.string().optional(),
  hits: z.object({
    total: z.object({
      value: z.number(),
      relation: z.string().optional(),
    }).passthrough().optional(),
    hits: z.array(Hit).default([]),
  }).passthrough(),
}).passthrough();

export const PitOpenResponse = z.object({ id: z.string() }).passthrough();

export type SpiderfootRecord = z.infer<typeof SpiderfootRecord>;
export type SpiderfootHit = z.infer<typeof Hit>;
export type SpiderfootSearchResponse = z.infer<typeof SpiderfootSearchResponse>;
export type ElkSortValue = (string | number | null)[];
