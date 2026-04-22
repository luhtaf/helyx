import { z } from 'zod';
import { parsePurl, productSlugCandidates } from './purl.js';

const Component = z.object({
  type: z.string().optional(),
  name: z.string(),
  version: z.string().optional(),
  purl: z.string().optional(),
  cpe: z.string().optional(),
}).passthrough();

const CycloneDxBom = z.object({
  bomFormat: z.string().optional(),
  specVersion: z.string().optional(),
  metadata: z.object({
    component: Component.optional(),
  }).passthrough().optional(),
  components: z.array(Component).optional(),
}).passthrough();

export type CycloneDxBom = z.infer<typeof CycloneDxBom>;

export interface MappedComponent {
  purl: string;
  name: string;
  version: string | null;
  type: string | null;
  cpeUri: string | null;
  productSlugCandidates: string[];
}

export interface MappedSbom {
  format: 'CycloneDX';
  specVersion: string | null;
  components: MappedComponent[];
  skippedNoPurl: number;
}

export function parseCycloneDx(raw: unknown): MappedSbom {
  const bom = CycloneDxBom.parse(raw);
  if (bom.bomFormat && bom.bomFormat !== 'CycloneDX') {
    throw new Error(`Expected CycloneDX bomFormat, got "${bom.bomFormat}"`);
  }

  const seen = new Set<string>();
  const components: MappedComponent[] = [];
  let skippedNoPurl = 0;

  for (const c of bom.components ?? []) {
    if (!c.purl) {
      skippedNoPurl++;
      continue;
    }
    if (seen.has(c.purl)) continue;
    seen.add(c.purl);

    const parsed = parsePurl(c.purl);
    components.push({
      purl: c.purl,
      name: c.name,
      version: c.version ?? parsed?.version ?? null,
      type: c.type ?? null,
      cpeUri: c.cpe ?? null,
      productSlugCandidates: parsed ? productSlugCandidates(parsed) : [c.name.toLowerCase()],
    });
  }

  return {
    format: 'CycloneDX',
    specVersion: bom.specVersion ?? null,
    components,
    skippedNoPurl,
  };
}
