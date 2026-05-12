import { z } from 'zod';

// Wire shapes are loose — use .passthrough() so OTX adding fields
// never breaks us. Only the bits we surface up are validated strictly.

export const OTX_IOC_KINDS = ['ipv4', 'ipv6', 'domain', 'hostname', 'url', 'file_md5', 'file_sha1', 'file_sha256', 'cve'] as const;
export type OtxIocKind = (typeof OTX_IOC_KINDS)[number];

// OTX URL segments by kind. Their REST path uses different segments
// for different IOC types — encapsulate the mapping here so callers
// pass our normalized kind only.
export const OTX_URL_SEGMENT: Record<OtxIocKind, string> = {
  ipv4:        'IPv4',
  ipv6:        'IPv6',
  domain:      'domain',
  hostname:    'hostname',
  url:         'url',
  file_md5:    'file',
  file_sha1:   'file',
  file_sha256: 'file',
  cve:         'cve',
};

// Pulse = OTX's named campaign/cluster — operator-curated bundle of
// indicators with shared narrative. Each pulse carries adversary tags,
// MITRE technique ids, and references.
export const OtxPulseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().default(''),
  author_name: z.string().optional().default(''),
  modified: z.string().optional(),
  created: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  references: z.array(z.string()).optional().default([]),
  adversary: z.string().optional().default(''),
  industries: z.array(z.string()).optional().default([]),
  targeted_countries: z.array(z.string()).optional().default([]),
  attack_ids: z.array(z.union([
    z.string(),
    // OTX sometimes returns objects instead of strings: { id, name, display_name }
    z.object({ id: z.string(), name: z.string().optional(), display_name: z.string().optional() }).passthrough(),
  ])).optional().default([]),
  malware_families: z.array(z.union([
    z.string(),
    z.object({ id: z.string().optional(), display_name: z.string() }).passthrough(),
  ])).optional().default([]),
}).passthrough();

export const OtxGeneralResponseSchema = z.object({
  pulse_info: z.object({
    count: z.number().optional().default(0),
    pulses: z.array(OtxPulseSchema).optional().default([]),
    references: z.array(z.string()).optional().default([]),
  }).passthrough().optional(),
  reputation: z.number().optional(),
  type_title: z.string().optional(),
  base_indicator: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    indicator: z.string().optional(),
    type: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

export type OtxPulse = z.infer<typeof OtxPulseSchema>;
export type OtxGeneralResponse = z.infer<typeof OtxGeneralResponseSchema>;
