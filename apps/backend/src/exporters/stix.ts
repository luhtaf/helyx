// H5 — Pack hunt-generated rules as a STIX 2.1 Bundle.
//
// Output is a STIX 2.1 Bundle SDO containing one Identity (the org), one
// Indicator per *approved* DetectionRule (F2 enforcement gate), and a
// TLP marking-definition derived from the Hunt's releaseTier (F1).
//
// Skeleton scope (this commit): bundle generation + persistence of
// :StixExport metadata. Defer to follow-up: JSON-Schema validation
// against OASIS fixtures, Ed25519 signing, push paths.

import { randomUUID, createHash } from 'node:crypto';
import { getSession } from '../db/neo4j.js';
import { RELEASE_TIER_RANK, type ReleaseTier } from '../cti/kinds.js';
import type { RuleKind } from '../rules/kinds.js';
import { validateStixBundle } from './stix-validate.js';
import { getActiveOrCreateOrgKeypair } from '../cti/sign/keypair.js';
import { signBytes } from '../cti/sign/sign.js';
import { getRedactionProfile, policiesOf } from '../cti/redaction/repo.js';
import { applyRedaction } from '../cti/redaction/redact.js';

// OASIS standard TLP marking-definition IDs (stable, well-known UUIDs).
// See https://docs.oasis-open.org/cti/stix/v2.1/os/stix-v2.1-os.html#_yd3ar14ekwrs
const OASIS_TLP: Record<'white' | 'green' | 'amber' | 'red', string> = {
  white: 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9',
  green: 'marking-definition--34098fce-860f-48ae-8e50-ebd3cc5e41da',
  amber: 'marking-definition--f88d31f6-486f-44da-b317-01333bde0b82',
  red:   'marking-definition--5e57c739-391a-4eb3-b6be-7d15ca92d5ed',
};

// F1 release-tier → TLP marking. Mirrors the need-to-know ladder
// public/cross-agency/sectoral/internal → TLP white/green/amber/red.
const TIER_TO_TLP: Record<ReleaseTier, keyof typeof OASIS_TLP> = {
  public:         'white',
  'cross-agency': 'green',
  sectoral:       'amber',
  internal:       'red',
};

// STIX 2.1 indicator.pattern_type. Sigma is a community extension; OASIS
// reserves 'stix' / 'snort' / 'yara' / 'pcre'. Suricata uses the snort
// dialect for STIX purposes.
const KIND_TO_PATTERN_TYPE: Record<RuleKind, string> = {
  YARA:     'yara',
  SURICATA: 'snort',
  SIGMA:    'sigma',
  CUSTOM:   'stix',
};

interface BundleRule {
  id: string;
  kind: RuleKind;
  name: string;
  description: string | null;
  content: string;
  tags: string[];
  status: string;
  approvedAt: string | null;
  approvalContentHash: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BundleHunt {
  id: string;
  name: string;
  releaseTier: ReleaseTier;
  /** F3a — null means no redaction (full bundle). */
  redactionProfileId: string | null;
}

interface BundleOrg {
  id: string;
  name: string;
}

// Loose typing — STIX SDOs have many shapes. The boundary keeps the code
// readable without sprawling per-type interfaces nobody will read again.
type StixObject = Record<string, unknown>;

interface StixBundle {
  type: 'bundle';
  id: string;
  objects: StixObject[];
}

async function fetchBundleInputs(
  tenantId: string,
  huntId: string,
): Promise<{ hunt: BundleHunt | null; rules: BundleRule[]; org: BundleOrg | null }> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (h:Hunt {id: $huntId, tenantId: $tenantId})
       OPTIONAL MATCH (o:Organization {id: $tenantId})
       OPTIONAL MATCH (h)-[:GENERATED]->(r:DetectionRule)
       WITH h, o, r ORDER BY r.kind ASC, r.name ASC
       RETURN h.id AS huntId, h.name AS huntName,
              coalesce(h.releaseTier, 'internal') AS huntTier,
              h.redactionProfileId AS redactionProfileId,
              o.id AS orgId, coalesce(o.name, 'Unknown Org') AS orgName,
              collect(CASE WHEN r IS NULL THEN null ELSE {
                id: r.id, kind: r.kind, name: r.name,
                description: r.description, content: r.content,
                tags: r.tags, status: r.status,
                approvedAt: toString(r.approvedAt),
                approvalContentHash: r.approvalContentHash,
                createdAt: toString(r.createdAt), updatedAt: toString(r.updatedAt)
              } END) AS rules`,
      { tenantId, huntId },
    );
    const rec = r.records[0];
    if (!rec) return { hunt: null, rules: [], org: null };
    const hunt: BundleHunt = {
      id: rec.get('huntId') as string,
      name: rec.get('huntName') as string,
      releaseTier: rec.get('huntTier') as ReleaseTier,
      redactionProfileId: (rec.get('redactionProfileId') as string | null) ?? null,
    };
    const org: BundleOrg = {
      id: (rec.get('orgId') as string | null) ?? tenantId,
      name: rec.get('orgName') as string,
    };
    const rawRules = rec.get('rules') as Array<BundleRule | null>;
    const rules = rawRules.filter((x): x is BundleRule => x !== null);
    return { hunt, rules, org };
  } finally {
    await session.close();
  }
}

// Stable UUIDv5-ish: derive deterministic STIX IDs from rule.id so re-exports
// produce the same indicator id (consumers can dedupe / update). Plain
// sha256→uuid format; not RFC4122 v5 strictly but stable + unique enough.
function deriveStixId(prefix: string, sourceId: string): string {
  const h = createHash('sha256').update(`${prefix}:${sourceId}`).digest('hex');
  return `${prefix}--${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function buildIdentity(org: BundleOrg, now: string): StixObject {
  return {
    type: 'identity',
    spec_version: '2.1',
    id: deriveStixId('identity', org.id),
    created: now,
    modified: now,
    name: org.name,
    identity_class: 'organization',
  };
}

function buildIndicator(rule: BundleRule, identityId: string, tlpId: string): StixObject {
  const indicatorId = deriveStixId('indicator', rule.id);
  // STIX requires valid_from. Approved rules must have approvedAt (filtered
  // upstream) — fall back to createdAt defensively.
  const validFrom = rule.approvedAt ?? rule.createdAt;
  return {
    type: 'indicator',
    spec_version: '2.1',
    id: indicatorId,
    created: rule.createdAt,
    modified: rule.updatedAt,
    created_by_ref: identityId,
    name: rule.name,
    description: rule.description ?? undefined,
    indicator_types: ['anomalous-activity'],
    pattern: rule.content,
    pattern_type: KIND_TO_PATTERN_TYPE[rule.kind],
    valid_from: validFrom,
    object_marking_refs: [tlpId],
    labels: rule.tags.length > 0 ? rule.tags : undefined,
  };
}

export interface StixBundleResult {
  bundle: StixBundle;
  filename: string;
  json: string;
  bytes: Buffer;
  stats: {
    indicatorCount: number;
    skippedUnapproved: number;
    skippedStale: number;
    tlp: keyof typeof OASIS_TLP;
    tier: ReleaseTier;
    /** F3a — null when no profile was applied. */
    redactionProfileId: string | null;
    redactionIndicatorsMasked: number;
    redactionIdentityStripped: boolean;
  };
  /** Source DetectionRule ids that produced indicators in the bundle.
   *  Used by persistStixExport to wire :INCLUDES edges. */
  sourceRuleIds: string[];
}

export async function buildHuntStixBundle(
  tenantId: string,
  huntId: string,
): Promise<{ ok: true; result: StixBundleResult } | { ok: false; reason: string }> {
  const { hunt, rules, org } = await fetchBundleInputs(tenantId, huntId);
  if (!hunt || !org) return { ok: false, reason: 'hunt not found' };
  if (rules.length === 0) {
    return { ok: false, reason: 'hunt has no generated rules — run generateRulesFromHunt first' };
  }

  // F2 gate — only approved + non-stale rules export. Stale = current
  // sha256(content) != approvalContentHash.
  let skippedUnapproved = 0;
  let skippedStale = 0;
  const approved: BundleRule[] = [];
  for (const r of rules) {
    if (!r.approvedAt || !r.approvalContentHash) {
      skippedUnapproved++;
      continue;
    }
    const currentHash = createHash('sha256').update(r.content, 'utf8').digest('hex');
    if (currentHash !== r.approvalContentHash) {
      skippedStale++;
      continue;
    }
    approved.push(r);
  }

  if (approved.length === 0) {
    return {
      ok: false,
      reason: `no approved rules to export (skipped ${skippedUnapproved} unapproved + ${skippedStale} stale). Approve rules in /rules/<id> first.`,
    };
  }

  const tlp = TIER_TO_TLP[hunt.releaseTier];
  const tlpId = OASIS_TLP[tlp];
  const now = new Date().toISOString();

  const identity = buildIdentity(org, now);
  const objects: StixObject[] = [identity];
  for (const r of approved) {
    objects.push(buildIndicator(r, identity.id as string, tlpId));
  }

  const fullBundle: StixBundle = {
    type: 'bundle',
    id: `bundle--${randomUUID()}`,
    objects,
  };

  // F3a — apply redaction profile (if any) BEFORE validation + signing.
  // What goes out the door is what we sign + validate. 'full' profile is
  // a no-op fast path. Non-existent / cross-tenant profileId silently
  // resolves to null (= no masking) — fail-open here is safer than
  // failing closed (operator wouldn't know why export broke).
  let redactionPolicies = null;
  let redactionProfileId: string | null = null;
  let redactionStats: { indicatorsMasked: number; identityStripped: boolean } | null = null;
  if (hunt.redactionProfileId) {
    const profile = await getRedactionProfile(tenantId, hunt.redactionProfileId);
    if (profile) {
      redactionPolicies = policiesOf(profile);
      redactionProfileId = profile.id;
    }
  }
  const redacted = applyRedaction(fullBundle, redactionPolicies);
  const bundle = redacted.bundle as StixBundle;
  redactionStats = {
    indicatorsMasked: redacted.stats.indicatorsMasked,
    identityStripped: redacted.stats.identityStripped,
  };

  // H5b — fail loud on generator bugs. Validation against our focused
  // STIX 2.1 schema set runs every export so any future shape regression
  // (typo in pattern_type, missing valid_from, malformed id) surfaces
  // immediately instead of breaking downstream consumers. Runs AFTER
  // redaction so we validate what we actually ship.
  const validation = validateStixBundle(bundle);
  if (!validation.valid) {
    const detail = validation.errors.slice(0, 5)
      .map((e) => `${e.path}: ${e.message}`)
      .join('; ');
    return {
      ok: false,
      reason: `STIX validation failed (generator bug): ${detail}`,
    };
  }

  const json = JSON.stringify(bundle, null, 2);
  const bytes = Buffer.from(json, 'utf8');
  const safeName = hunt.name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) || 'hunt';
  const filename = `${safeName}-stix.json`;

  return {
    ok: true,
    result: {
      bundle,
      filename,
      json,
      bytes,
      stats: {
        indicatorCount: approved.length,
        skippedUnapproved,
        skippedStale,
        tlp,
        tier: hunt.releaseTier,
        redactionProfileId,
        redactionIndicatorsMasked: redactionStats.indicatorsMasked,
        redactionIdentityStripped: redactionStats.identityStripped,
      },
      sourceRuleIds: approved.map((r) => r.id),
    },
  };
}

export interface StixExportRecord {
  id: string;
  tenantId: string;
  huntId: string;
  ts: string;
  bundleId: string;
  indicatorCount: number;
  tlp: string;
  releaseTier: ReleaseTier;
  bytesSize: number;
  contentHash: string;
  /** F2 — Ed25519 detached signature (base64) over the bundle bytes. */
  signature: string;
  /** F2 — id of the :CtiOrgKeypair used to sign. */
  signedByKeypairId: string;
  /** F2 — public key of the signer (PEM). Verifiers can use directly
   *  without an extra fetch. */
  signerPublicKeyPem: string;
}

// Persist :StixExport metadata + edges per m019 schema. Bundle bytes
// themselves are NOT persisted (re-generatable from Hunt + included rules).
// F2: signs the bundle with the org keypair (lazy-created on first call)
// and persists the signature + SIGNED_BY edge.
export async function persistStixExport(
  tenantId: string,
  huntId: string,
  result: StixBundleResult,
  approvedRuleIds: string[],
): Promise<StixExportRecord> {
  const id = randomUUID();
  const ts = new Date().toISOString();
  const contentHash = createHash('sha256').update(result.bytes).digest('hex');

  // F2 — sign bundle bytes with the org's Ed25519 keypair. Lazy-create
  // on first export. Failure here (e.g. CTI_SIGNING_MASTER_KEY missing)
  // surfaces to the resolver and aborts the export — unsigned exports
  // are not allowed once F2 is wired.
  const keypair = await getActiveOrCreateOrgKeypair(tenantId);
  const signature = signBytes(keypair.privateKey, result.bytes);

  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (h:Hunt {id: $huntId, tenantId: $tenantId})
         MATCH (k:CtiOrgKeypair {id: $keypairId})
         CREATE (e:StixExport {
           id: $id, tenantId: $tenantId, huntId: $huntId,
           ts: datetime($ts),
           bundleId: $bundleId, indicatorCount: $indicatorCount,
           tlp: $tlp, releaseTier: $releaseTier,
           bytesSize: $bytesSize, contentHash: $contentHash,
           signature: $signature, signatureAlgorithm: 'ed25519',
           redactionProfileId: $redactionProfileId,
           redactionIndicatorsMasked: $redactionIndicatorsMasked,
           redactionIdentityStripped: $redactionIdentityStripped
         })
         MERGE (e)-[:DERIVED_FROM]->(h)
         MERGE (e)-[:SIGNED_BY]->(k)
         WITH e
         UNWIND $ruleIds AS rid
         MATCH (r:DetectionRule {id: rid, tenantId: $tenantId})
         MERGE (e)-[:INCLUDES]->(r)`,
        {
          id, tenantId, huntId, ts,
          bundleId: result.bundle.id,
          indicatorCount: result.stats.indicatorCount,
          tlp: result.stats.tlp,
          releaseTier: result.stats.tier,
          bytesSize: result.bytes.length,
          contentHash,
          signature,
          keypairId: keypair.id,
          ruleIds: approvedRuleIds,
          redactionProfileId: result.stats.redactionProfileId,
          redactionIndicatorsMasked: result.stats.redactionIndicatorsMasked,
          redactionIdentityStripped: result.stats.redactionIdentityStripped,
        },
      );
    });
    return {
      id, tenantId, huntId, ts,
      bundleId: result.bundle.id,
      indicatorCount: result.stats.indicatorCount,
      tlp: result.stats.tlp,
      releaseTier: result.stats.tier,
      bytesSize: result.bytes.length,
      contentHash,
      signature,
      signedByKeypairId: keypair.id,
      signerPublicKeyPem: keypair.publicKeyPem,
    };
  } finally {
    await session.close();
  }
}

// Convenience export — for callers that don't care about the full record.
export const STIX_TLP_LADDER = TIER_TO_TLP;
export const STIX_RANK = RELEASE_TIER_RANK;

export interface StixExportRow {
  id: string;
  ts: string;
  bundleId: string;
  indicatorCount: number;
  tlp: string;
  releaseTier: ReleaseTier;
  bytesSize: number;
  contentHash: string;
  /** First 16 chars of base64 sig — full sig is too long for list views,
   *  full record fetched separately on detail. */
  signaturePrefix: string;
  signatureAlgorithm: string;
  signedByKeypairId: string;
}

// H5.5 — list past exports for a hunt, newest first. Used by the
// Export history panel on GraphView so signing provenance is visible
// beyond the post-export toast.
export async function listStixExportsForHunt(
  tenantId: string,
  huntId: string,
  limit: number = 10,
): Promise<StixExportRow[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (e:StixExport {tenantId: $tenantId, huntId: $huntId})
       OPTIONAL MATCH (e)-[:SIGNED_BY]->(k:CtiOrgKeypair)
       RETURN e.id AS id, toString(e.ts) AS ts,
              e.bundleId AS bundleId, e.indicatorCount AS indicatorCount,
              e.tlp AS tlp, e.releaseTier AS releaseTier,
              e.bytesSize AS bytesSize, e.contentHash AS contentHash,
              substring(coalesce(e.signature, ''), 0, 16) AS signaturePrefix,
              coalesce(e.signatureAlgorithm, 'ed25519') AS signatureAlgorithm,
              k.id AS signedByKeypairId
       ORDER BY e.ts DESC
       LIMIT toInteger($limit)`,
      { tenantId, huntId, limit: Math.max(1, Math.min(limit, 50)) },
    );
    return r.records.map((rec) => ({
      id: rec.get('id') as string,
      ts: rec.get('ts') as string,
      bundleId: rec.get('bundleId') as string,
      indicatorCount: (rec.get('indicatorCount') as { toInt?: () => number } | number)?.toString
        ? Number((rec.get('indicatorCount') as { toString: () => string }).toString())
        : (rec.get('indicatorCount') as number),
      tlp: rec.get('tlp') as string,
      // Encode dash → underscore at the boundary: storage uses 'cross-agency'
      // but GraphQL ReleaseTier enum forbids hyphens (uses 'cross_agency').
      releaseTier: ((rec.get('releaseTier') as string) ?? 'internal').replace(/-/g, '_') as ReleaseTier,
      bytesSize: Number((rec.get('bytesSize') as { toString: () => string }).toString()),
      contentHash: rec.get('contentHash') as string,
      signaturePrefix: rec.get('signaturePrefix') as string,
      signatureAlgorithm: rec.get('signatureAlgorithm') as string,
      signedByKeypairId: (rec.get('signedByKeypairId') as string | null) ?? '',
    }));
  } finally {
    await session.close();
  }
}
