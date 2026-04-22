import { parseCpe } from './cpe.js';
import type { NvdCve } from './types.js';

export interface VendorRow { slug: string; name: string }
export interface ProductRow { vendorSlug: string; slug: string; name: string }
export interface CpeRow {
  uri: string;
  part: string;
  vendor: string;
  product: string;
  version: string;
  update: string;
  edition: string;
  language: string;
  swEdition: string;
  targetSw: string;
  targetHw: string;
  other: string;
}
export interface CveRow {
  id: string;
  description: string | null;
  vulnStatus: string | null;
  sourceIdentifier: string | null;
  publishedAt: string;
  lastModifiedAt: string;
  cvssV31BaseScore: number | null;
  cvssV31BaseSeverity: string | null;
  cvssV31VectorString: string | null;
  cvssV2BaseScore: number | null;
  cvssV2BaseSeverity: string | null;
  cvssV2VectorString: string | null;
}
export interface AffectsEdge {
  cveId: string;
  cpeUri: string;
  matchCriteriaId: string;
  vulnerable: boolean;
  versionStartIncluding: string | null;
  versionStartExcluding: string | null;
  versionEndIncluding: string | null;
  versionEndExcluding: string | null;
}
export interface CweRow { id: string }
export interface CveCweEdge { cveId: string; cweId: string }
export interface ReferenceRow { url: string; source: string | null; tags: string[] }
export interface CveReferenceEdge { cveId: string; url: string }
export interface VendorCpeEdge { vendorSlug: string; cpeUri: string }
export interface ProductCpeEdge { vendorSlug: string; productSlug: string; cpeUri: string }

export interface MappedBatch {
  vendors: VendorRow[];
  products: ProductRow[];
  cpes: CpeRow[];
  cves: CveRow[];
  affects: AffectsEdge[];
  cwes: CweRow[];
  cveCwe: CveCweEdge[];
  references: ReferenceRow[];
  cveReferences: CveReferenceEdge[];
  vendorCpe: VendorCpeEdge[];
  productCpe: ProductCpeEdge[];
}

const WILDCARD = new Set(['*', '-', '']);

export function mapBatch(items: NvdCve[]): MappedBatch {
  const vendors = new Map<string, VendorRow>();
  const products = new Map<string, ProductRow>();
  const cpes = new Map<string, CpeRow>();
  const cwes = new Map<string, CweRow>();
  const references = new Map<string, ReferenceRow>();
  const vendorCpeSeen = new Set<string>();
  const productCpeSeen = new Set<string>();
  const cveCweSeen = new Set<string>();
  const cveReferenceSeen = new Set<string>();
  const affectsSeen = new Set<string>();

  const cves: CveRow[] = [];
  const affects: AffectsEdge[] = [];
  const cveCwe: CveCweEdge[] = [];
  const cveReferences: CveReferenceEdge[] = [];
  const vendorCpe: VendorCpeEdge[] = [];
  const productCpe: ProductCpeEdge[] = [];

  for (const cve of items) {
    cves.push(toCveRow(cve));

    for (const w of cve.weaknesses ?? []) {
      for (const d of w.description) {
        const id = d.value.trim();
        if (!/^CWE-\d+$/.test(id)) continue;
        cwes.set(id, { id });
        const key = `${cve.id}|${id}`;
        if (!cveCweSeen.has(key)) {
          cveCweSeen.add(key);
          cveCwe.push({ cveId: cve.id, cweId: id });
        }
      }
    }

    for (const r of cve.references ?? []) {
      if (!references.has(r.url)) {
        references.set(r.url, { url: r.url, source: r.source ?? null, tags: r.tags ?? [] });
      }
      const key = `${cve.id}|${r.url}`;
      if (!cveReferenceSeen.has(key)) {
        cveReferenceSeen.add(key);
        cveReferences.push({ cveId: cve.id, url: r.url });
      }
    }

    for (const conf of cve.configurations ?? []) {
      for (const node of conf.nodes ?? []) {
        for (const m of node.cpeMatch ?? []) {
          const parsed = parseCpe(m.criteria);
          if (!parsed) continue;
          cpes.set(parsed.uri, parsed);

          const vendorValid = !WILDCARD.has(parsed.vendor);
          const productValid = !WILDCARD.has(parsed.product);

          if (vendorValid) {
            vendors.set(parsed.vendor, { slug: parsed.vendor, name: parsed.vendor });
            const vk = `${parsed.vendor}|${parsed.uri}`;
            if (!vendorCpeSeen.has(vk)) {
              vendorCpeSeen.add(vk);
              vendorCpe.push({ vendorSlug: parsed.vendor, cpeUri: parsed.uri });
            }
          }

          if (vendorValid && productValid) {
            const pk = `${parsed.vendor}\x00${parsed.product}`;
            products.set(pk, { vendorSlug: parsed.vendor, slug: parsed.product, name: parsed.product });
            const pek = `${parsed.vendor}|${parsed.product}|${parsed.uri}`;
            if (!productCpeSeen.has(pek)) {
              productCpeSeen.add(pek);
              productCpe.push({ vendorSlug: parsed.vendor, productSlug: parsed.product, cpeUri: parsed.uri });
            }
          }

          const mcId = m.matchCriteriaId
            ?? `${cve.id}|${parsed.uri}|${m.versionStartIncluding ?? ''}|${m.versionStartExcluding ?? ''}|${m.versionEndIncluding ?? ''}|${m.versionEndExcluding ?? ''}|${m.vulnerable}`;
          const ak = `${cve.id}|${mcId}`;
          if (affectsSeen.has(ak)) continue;
          affectsSeen.add(ak);
          affects.push({
            cveId: cve.id,
            cpeUri: parsed.uri,
            matchCriteriaId: mcId,
            vulnerable: m.vulnerable,
            versionStartIncluding: m.versionStartIncluding ?? null,
            versionStartExcluding: m.versionStartExcluding ?? null,
            versionEndIncluding: m.versionEndIncluding ?? null,
            versionEndExcluding: m.versionEndExcluding ?? null,
          });
        }
      }
    }
  }

  return {
    vendors: [...vendors.values()],
    products: [...products.values()],
    cpes: [...cpes.values()],
    cves,
    affects,
    cwes: [...cwes.values()],
    cveCwe,
    references: [...references.values()],
    cveReferences,
    vendorCpe,
    productCpe,
  };
}

function toCveRow(cve: NvdCve): CveRow {
  const enDescription = cve.descriptions?.find((d) => d.lang === 'en')?.value ?? null;
  const m31 = cve.metrics?.cvssMetricV31?.[0]?.cvssData ?? cve.metrics?.cvssMetricV30?.[0]?.cvssData;
  const m31Sev = m31?.baseSeverity ?? null;
  const m2Entry = cve.metrics?.cvssMetricV2?.[0];

  return {
    id: cve.id,
    description: enDescription,
    vulnStatus: cve.vulnStatus ?? null,
    sourceIdentifier: cve.sourceIdentifier ?? null,
    publishedAt: cve.published,
    lastModifiedAt: cve.lastModified,
    cvssV31BaseScore: m31?.baseScore ?? null,
    cvssV31BaseSeverity: m31Sev,
    cvssV31VectorString: m31?.vectorString ?? null,
    cvssV2BaseScore: m2Entry?.cvssData.baseScore ?? null,
    cvssV2BaseSeverity: m2Entry?.baseSeverity ?? null,
    cvssV2VectorString: m2Entry?.cvssData.vectorString ?? null,
  };
}
