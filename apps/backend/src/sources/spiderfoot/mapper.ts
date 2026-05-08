import type { SpiderfootRecord } from './types.js';

// Spiderfoot Subsektor → Helyx sektor.slug. Anything missing falls back to
// null and the operator can fix the mapping or add a new sektor migration.
// Keep this in sync with m012_seed_sektor.ts.
const SUBSEKTOR_TO_SEKTOR_SLUG: Record<string, string> = {
  'Pemerintah Pusat': 'administrasi-pemerintahan',
  'Pemerintah Daerah': 'administrasi-pemerintahan',
  'Perbankan': 'keuangan',
  'Keuangan': 'keuangan',
  'Telekomunikasi': 'tik',
  'TIK': 'tik',
  'Energi': 'energi',
  'ESDM': 'esdm',
  'Transportasi': 'transportasi',
  'Pendidikan': 'pendidikan',
  'Kesehatan': 'kesehatan',
  'Pertahanan': 'pertahanan',
  'Pangan': 'pangan',
  'Pertanian': 'pangan',
  'Perdagangan': 'perdagangan',
  'Industri': 'industri',
  'Pariwisata': 'pariwisata',
  'Logistik': 'logistik',
  'Media': 'media',
  'Ormas': 'ormas',
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// "Vendor:Product:Version" → pkg:generic/<vendor>/<product>@<version>
function buildPurl(vendor: string | null, product: string | null, version: string | null): string | null {
  if (!product) return null;
  const v = vendor ? slugify(vendor) : 'generic';
  const p = slugify(product);
  if (!p) return null;
  return version ? `pkg:generic/${v}/${p}@${version}` : `pkg:generic/${v}/${p}`;
}

export interface StakeholderRow {
  tenantId: string;
  slug: string;
  name: string;
  sektorSlug: string | null;
}

export interface AssetRow {
  tenantId: string;
  hostname: string;        // canonical key per (tenantId, hostname)
  kind: 'HOST' | 'APPLICATION';
  scanName: string | null; // trace: which Spiderfoot scan produced this
}

export interface OwnsEdgeRow {
  tenantId: string;
  stakeholderSlug: string;
  assetHostname: string;
}

export interface ComponentRow {
  tenantId: string;
  assetHostname: string;
  purl: string;
  vendor: string | null;
  vendorSlug: string | null;
  product: string;
  productSlug: string;
  version: string | null;
  cveId: string | null;
}

export interface AttributedCveRow {
  tenantId: string;
  assetHostname: string;
  cveId: string;
  score: number | null;
  severity: string | null;
  scanName: string | null;
}

export interface MappedBatch {
  stakeholders: StakeholderRow[];
  assets: AssetRow[];
  owns: OwnsEdgeRow[];
  components: ComponentRow[];
  attributedCves: AttributedCveRow[];
  skipped: number;
}

/**
 * Map Spiderfoot records → 4 row arrays for one tenant. Idempotent:
 * de-dupes within the batch via Map keys so repeated MERGEs don't fight.
 *
 * Currently focuses on VULNERABILITY_CVE_* events (the rich path with
 * vendor/product/version + CVE-ID + score). Other event types are noted
 * but skipped — extend in v2 when we wire INTERNET_NAME / IP_ADDRESS as
 * separate Asset rows.
 */
export function mapBatch(records: SpiderfootRecord[], tenantId: string): MappedBatch {
  const stakeholders = new Map<string, StakeholderRow>();          // key: slug
  const assets = new Map<string, AssetRow>();                      // key: hostname
  const owns = new Map<string, OwnsEdgeRow>();                     // key: slug|host
  const components = new Map<string, ComponentRow>();              // key: host|purl
  const attributedCves = new Map<string, AttributedCveRow>();      // key: host|cveId
  let skipped = 0;

  for (const rec of records) {
    if (!rec.Type.startsWith('VULNERABILITY_CVE_')) {
      skipped++;
      continue;
    }
    const orgName = rec.Organisasi?.trim();
    const target = (rec.Target ?? rec.Source ?? '').trim();
    const cveId = (rec.Vuln ?? rec.Vulnerability ?? '').trim().toUpperCase();
    if (!orgName || !target || !cveId.startsWith('CVE-')) {
      skipped++;
      continue;
    }

    const slug = slugify(orgName);
    if (!slug) { skipped++; continue; }

    if (!stakeholders.has(slug)) {
      stakeholders.set(slug, {
        tenantId,
        slug,
        name: orgName,
        sektorSlug: rec.Subsektor ? (SUBSEKTOR_TO_SEKTOR_SLUG[rec.Subsektor] ?? null) : null,
      });
    }

    if (!assets.has(target)) {
      assets.set(target, {
        tenantId,
        hostname: target,
        kind: 'APPLICATION',
        scanName: rec['Scan Name'] ?? null,
      });
    }

    const ownsKey = `${slug}|${target}`;
    if (!owns.has(ownsKey)) {
      owns.set(ownsKey, { tenantId, stakeholderSlug: slug, assetHostname: target });
    }

    // Always emit ATTRIBUTED_CVE — external attribution by Spiderfoot.
    // This is NOT a local match decision (owner's rule), it's persisted
    // ground-truth from an external scanner. Score/severity stored on edge
    // so UI can show "spiderfoot reported HIGH (7.5)" vs the catalog's CVSS.
    const acvKey = `${target}|${cveId}`;
    if (!attributedCves.has(acvKey)) {
      attributedCves.set(acvKey, {
        tenantId,
        assetHostname: target,
        cveId,
        score: rec.Score ?? null,
        severity: rec.Severity ?? null,
        scanName: rec['Scan Name'] ?? null,
      });
    }

    // Optional: if Spiderfoot supplied affected[], also build the richer
    // chain so Asset.cves(mode) (version-aware) sees this asset too. This
    // is the path for SBOM-style consumers; ATTRIBUTED_CVE above covers
    // the 78% of events without affected[].
    const aff = rec.affected?.[0];
    const vendor = aff?.vendor?.trim() || null;
    const product = aff?.product?.trim() || null;
    const version = aff?.version?.trim() || null;
    if (!product) continue;

    const purl = buildPurl(vendor, product, version);
    if (!purl) continue;

    const componentKey = `${target}|${purl}`;
    if (!components.has(componentKey)) {
      components.set(componentKey, {
        tenantId,
        assetHostname: target,
        purl,
        vendor,
        vendorSlug: vendor ? slugify(vendor) : null,
        product,
        productSlug: slugify(product),
        version,
        cveId,
      });
    }
  }

  return {
    stakeholders: [...stakeholders.values()],
    assets: [...assets.values()],
    owns: [...owns.values()],
    components: [...components.values()],
    attributedCves: [...attributedCves.values()],
    skipped,
  };
}
