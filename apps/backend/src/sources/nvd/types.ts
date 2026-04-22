import { z } from 'zod';

const CvssDataV31 = z.object({
  baseScore: z.number().nullable().optional(),
  baseSeverity: z.string().nullable().optional(),
  vectorString: z.string().nullable().optional(),
}).passthrough();

const CvssDataV2 = z.object({
  baseScore: z.number().nullable().optional(),
  vectorString: z.string().nullable().optional(),
}).passthrough();

const CvssMetricV31 = z.object({
  source: z.string().optional(),
  type: z.string().optional(),
  cvssData: CvssDataV31,
}).passthrough();

const CvssMetricV2 = z.object({
  source: z.string().optional(),
  type: z.string().optional(),
  baseSeverity: z.string().nullable().optional(),
  cvssData: CvssDataV2,
}).passthrough();

const Description = z.object({ lang: z.string(), value: z.string() });

const Weakness = z.object({
  source: z.string().optional(),
  type: z.string().optional(),
  description: z.array(Description),
}).passthrough();

const Reference = z.object({
  url: z.string(),
  source: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
}).passthrough();

const CpeMatch = z.object({
  vulnerable: z.boolean(),
  criteria: z.string(),
  matchCriteriaId: z.string().optional(),
  versionStartIncluding: z.string().optional(),
  versionStartExcluding: z.string().optional(),
  versionEndIncluding: z.string().optional(),
  versionEndExcluding: z.string().optional(),
}).passthrough();

const ConfigurationNode = z.object({
  operator: z.string().optional(),
  negate: z.boolean().optional(),
  cpeMatch: z.array(CpeMatch).optional(),
}).passthrough();

const Configuration = z.object({
  operator: z.string().optional(),
  nodes: z.array(ConfigurationNode).optional(),
}).passthrough();

const Cve = z.object({
  id: z.string(),
  sourceIdentifier: z.string().optional(),
  published: z.string(),
  lastModified: z.string(),
  vulnStatus: z.string().optional(),
  descriptions: z.array(Description).optional(),
  metrics: z.object({
    cvssMetricV31: z.array(CvssMetricV31).optional(),
    cvssMetricV30: z.array(CvssMetricV31).optional(),
    cvssMetricV2: z.array(CvssMetricV2).optional(),
  }).passthrough().optional(),
  weaknesses: z.array(Weakness).optional(),
  references: z.array(Reference).optional(),
  configurations: z.array(Configuration).optional(),
}).passthrough();

export const NvdCveSchema = Cve;

const Vulnerability = z.object({ cve: Cve }).passthrough();

export const NvdCvePage = z.object({
  resultsPerPage: z.number(),
  startIndex: z.number(),
  totalResults: z.number(),
  vulnerabilities: z.array(Vulnerability).optional().default([]),
}).passthrough();

export type NvdCvePage = z.infer<typeof NvdCvePage>;
export type NvdCve = z.infer<typeof Cve>;
