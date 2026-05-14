import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getSession } from '../db/neo4j.js';
import {
  type Scanner, type ScanReport, type DiscoveredAsset,
  type ScanReportStatus, type DiscoveredStatus, type ScanFormat, type ScannerStatus,
  type HelyxDiscoveryV1Payload,
} from './types.js';

// ─── Token utilities ───────────────────────────────────────────────

/** Mint a fresh scanner token. Returns plaintext + sha256 hash. The
 *  plaintext goes to the operator ONCE; only the hash is stored. */
export function mintScannerToken(): { plaintext: string; hash: string; prefix: string } {
  // 32 random bytes → 64 hex chars; prefixed for visual identification
  const raw = randomBytes(32).toString('hex');
  const plaintext = `scn_${raw}`;
  const hash = createHash('sha256').update(plaintext).digest('hex');
  // First 8 chars of plaintext (after 'scn_') for display
  const prefix = plaintext.slice(0, 12);
  return { plaintext, hash, prefix };
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

// ─── Scanner CRUD ───────────────────────────────────────────────────

const SCANNER_RETURN = `
  s.id AS id, s.tenantId AS tenantId, s.label AS label, s.scope AS scope,
  s.tokenHash AS tokenHash, s.tokenPrefix AS tokenPrefix,
  coalesce(s.status, 'active') AS status,
  s.createdByUserId AS createdByUserId,
  toString(s.createdAt) AS createdAt,
  toString(s.expiresAt) AS expiresAt,
  toString(s.lastSeenAt) AS lastSeenAt,
  toString(s.lastIngestAt) AS lastIngestAt,
  coalesce(s.totalIngests, 0) AS totalIngests
`;

function recordToScanner(rec: { get: (k: string) => unknown }): Scanner {
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    label: rec.get('label') as string,
    scope: rec.get('scope') as string,
    tokenHash: rec.get('tokenHash') as string,
    tokenPrefix: rec.get('tokenPrefix') as string,
    status: rec.get('status') as ScannerStatus,
    createdByUserId: rec.get('createdByUserId') as string,
    createdAt: rec.get('createdAt') as string,
    expiresAt: (rec.get('expiresAt') as string | null) ?? null,
    lastSeenAt: (rec.get('lastSeenAt') as string | null) ?? null,
    lastIngestAt: (rec.get('lastIngestAt') as string | null) ?? null,
    totalIngests: Number(rec.get('totalIngests') ?? 0),
  };
}

export async function listScanners(tenantId: string): Promise<Scanner[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (s:Scanner {tenantId: $tenantId})
       RETURN ${SCANNER_RETURN}
       ORDER BY s.status ASC, s.createdAt DESC`,
      { tenantId },
    );
    return r.records.map(recordToScanner);
  } finally {
    await session.close();
  }
}

export async function getScanner(tenantId: string, id: string): Promise<Scanner | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (s:Scanner {tenantId: $tenantId, id: $id})
       RETURN ${SCANNER_RETURN}`,
      { tenantId, id },
    );
    return r.records.length === 0 ? null : recordToScanner(r.records[0]!);
  } finally {
    await session.close();
  }
}

/** Look up by token hash (REST ingest path). Cross-tenant — caller
 *  reads the resulting tenantId from the scanner. */
export async function getScannerByTokenHash(tokenHash: string): Promise<Scanner | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (s:Scanner {tokenHash: $tokenHash})
       RETURN ${SCANNER_RETURN}
       LIMIT 1`,
      { tokenHash },
    );
    return r.records.length === 0 ? null : recordToScanner(r.records[0]!);
  } finally {
    await session.close();
  }
}

export interface CreateScannerInput {
  label: string;
  scope: string;
  expiresAt?: string | null;
}

/** Returns the plaintext token alongside the persisted scanner. The
 *  plaintext is shown to the operator exactly once. */
export async function createScanner(
  tenantId: string,
  createdByUserId: string,
  input: CreateScannerInput,
): Promise<{ scanner: Scanner; plaintextToken: string }> {
  const { plaintext, hash, prefix } = mintScannerToken();
  const id = randomUUID();
  const now = new Date().toISOString();
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `CREATE (s:Scanner {
           id: $id, tenantId: $tenantId,
           label: $label, scope: $scope,
           tokenHash: $hash, tokenPrefix: $prefix,
           status: 'active',
           createdByUserId: $createdByUserId,
           createdAt: datetime($now),
           expiresAt: ${input.expiresAt ? 'datetime($expiresAt)' : 'null'},
           totalIngests: 0
         })
         RETURN ${SCANNER_RETURN}`,
        {
          id, tenantId, createdByUserId, now,
          label: input.label, scope: input.scope,
          hash, prefix,
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        },
      ),
    );
    return { scanner: recordToScanner(r.records[0]!), plaintextToken: plaintext };
  } finally {
    await session.close();
  }
}

export async function rotateScannerToken(
  tenantId: string,
  id: string,
): Promise<{ scanner: Scanner; plaintextToken: string } | null> {
  const { plaintext, hash, prefix } = mintScannerToken();
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `MATCH (s:Scanner {tenantId: $tenantId, id: $id})
         SET s.tokenHash = $hash, s.tokenPrefix = $prefix
         RETURN ${SCANNER_RETURN}`,
        { tenantId, id, hash, prefix },
      ),
    );
    if (r.records.length === 0) return null;
    return { scanner: recordToScanner(r.records[0]!), plaintextToken: plaintext };
  } finally {
    await session.close();
  }
}

export async function setScannerStatus(
  tenantId: string,
  id: string,
  status: ScannerStatus,
): Promise<Scanner | null> {
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `MATCH (s:Scanner {tenantId: $tenantId, id: $id})
         SET s.status = $status
         RETURN ${SCANNER_RETURN}`,
        { tenantId, id, status },
      ),
    );
    return r.records.length === 0 ? null : recordToScanner(r.records[0]!);
  } finally {
    await session.close();
  }
}

// ─── Ingest path ────────────────────────────────────────────────────

/** Mark scanner as having ingested. Idempotent counter increment. */
export async function bumpScannerIngest(scannerId: string): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (s:Scanner {id: $scannerId})
         SET s.lastIngestAt = datetime(),
             s.lastSeenAt = datetime(),
             s.totalIngests = coalesce(s.totalIngests, 0) + 1`,
        { scannerId },
      );
    });
  } finally {
    await session.close();
  }
}

interface CreateReportResult {
  reportId: string;
  itemsAccepted: number;
}

/** Create a :ScanReport + N :DiscoveredAsset rows in one tx. Resolves
 *  parentName against same-report items so a payload `host → vm → ctr`
 *  chain lands as a connected hierarchy in the inbox.
 *
 *  scannerId is nullable: 'manual' source uploads have no agent. The
 *  list query handles null scannerLabel via OPTIONAL MATCH already. */
export async function createScanReport(
  tenantId: string,
  scannerId: string | null,
  source: 'token' | 'manual',
  format: ScanFormat,
  payload: HelyxDiscoveryV1Payload,
  rawJson: string,
): Promise<CreateReportResult> {
  const reportId = randomUUID();
  const ts = new Date().toISOString();
  const payloadHash = createHash('sha256').update(rawJson).digest('hex');
  const payloadSize = Buffer.byteLength(rawJson, 'utf8');
  const items = payload.items ?? [];

  // Pre-mint UUIDs for each item so we can resolve parentName → parentDiscoveredId
  // within the same transaction (no second pass needed).
  const itemRows = items.map((it) => ({
    discoveredId: randomUUID(),
    name: it.name,
    kind: it.kind,
    hostname: it.hostname ?? null,
    ipAddresses: it.ipAddresses ?? [],
    parentName: it.parentName ?? null,
  }));
  // Build name → discoveredId lookup for parent resolution.
  const nameToId = new Map<string, string>();
  for (const it of itemRows) nameToId.set(it.name, it.discoveredId);
  const itemRowsWithParent = itemRows.map((it) => ({
    ...it,
    parentDiscoveredId: it.parentName ? nameToId.get(it.parentName) ?? null : null,
  }));

  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `CREATE (r:ScanReport {
           id: $reportId, tenantId: $tenantId, scannerId: $scannerId,
           ts: datetime($ts), source: $source, format: $format,
           payloadHash: $payloadHash, payloadSize: $payloadSize,
           status: 'pending', itemCount: $itemCount
         })`,
        { reportId, tenantId, scannerId, ts, source, format, payloadHash, payloadSize, itemCount: items.length },
      );
      // Bulk insert discovered assets (UNWIND)
      await tx.run(
        `UNWIND $rows AS row
         CREATE (d:DiscoveredAsset {
           id: row.discoveredId, tenantId: $tenantId, reportId: $reportId,
           kind: row.kind, name: row.name, hostname: row.hostname,
           ipAddresses: row.ipAddresses,
           parentDiscoveredId: row.parentDiscoveredId,
           status: 'pending', matchedAssetId: null,
           createdAt: datetime()
         })`,
        { rows: itemRowsWithParent, tenantId, reportId },
      );
    });
  } finally {
    await session.close();
  }
  return { reportId, itemsAccepted: items.length };
}

// ─── Inventory inbox queries ────────────────────────────────────────

// Pattern comprehension `[(node) | proj]` needs a path pattern (with
// edge), not a naked node match. Lookup scanner via OPTIONAL MATCH +
// project after.
const REPORT_RETURN = `
  r.id AS id, r.tenantId AS tenantId, r.scannerId AS scannerId,
  scannerLabel,
  toString(r.ts) AS ts,
  r.source AS source, r.format AS format,
  r.payloadHash AS payloadHash,
  coalesce(r.payloadSize, 0) AS payloadSize,
  coalesce(r.status, 'pending') AS status,
  coalesce(r.itemCount, 0) AS itemCount,
  r.reviewerUserId AS reviewerUserId,
  toString(r.reviewedAt) AS reviewedAt
`;

function recordToReport(rec: { get: (k: string) => unknown }): ScanReport {
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    scannerId: rec.get('scannerId') as string,
    scannerLabel: (rec.get('scannerLabel') as string | null) ?? null,
    ts: rec.get('ts') as string,
    source: rec.get('source') as 'token' | 'manual',
    format: rec.get('format') as ScanFormat,
    payloadHash: rec.get('payloadHash') as string,
    payloadSize: Number(rec.get('payloadSize') ?? 0),
    status: rec.get('status') as ScanReportStatus,
    itemCount: Number(rec.get('itemCount') ?? 0),
    reviewerUserId: (rec.get('reviewerUserId') as string | null) ?? null,
    reviewedAt: (rec.get('reviewedAt') as string | null) ?? null,
  };
}

export async function listScanReports(
  tenantId: string,
  filter: { status?: ScanReportStatus | null } = {},
  limit: number = 50,
): Promise<ScanReport[]> {
  const where = filter.status
    ? 'WHERE coalesce(r.status, \'pending\') = $status'
    : '';
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (r:ScanReport {tenantId: $tenantId})
       ${where}
       OPTIONAL MATCH (s:Scanner {id: r.scannerId})
       WITH r, s.label AS scannerLabel
       RETURN ${REPORT_RETURN}
       ORDER BY r.ts DESC
       LIMIT toInteger($limit)`,
      { tenantId, limit: BigInt(limit), ...(filter.status ? { status: filter.status } : {}) },
    );
    return r.records.map(recordToReport);
  } finally {
    await session.close();
  }
}

const DISCOVERED_RETURN = `
  d.id AS id, d.tenantId AS tenantId, d.reportId AS reportId,
  d.kind AS kind, d.name AS name,
  d.hostname AS hostname,
  coalesce(d.ipAddresses, []) AS ipAddresses,
  d.parentDiscoveredId AS parentDiscoveredId,
  coalesce(d.status, 'pending') AS status,
  d.matchedAssetId AS matchedAssetId,
  toString(d.createdAt) AS createdAt
`;

function recordToDiscovered(rec: { get: (k: string) => unknown }): DiscoveredAsset {
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    reportId: rec.get('reportId') as string,
    kind: rec.get('kind') as string,
    name: rec.get('name') as string,
    hostname: (rec.get('hostname') as string | null) ?? null,
    ipAddresses: (rec.get('ipAddresses') as string[]) ?? [],
    parentDiscoveredId: (rec.get('parentDiscoveredId') as string | null) ?? null,
    status: rec.get('status') as DiscoveredStatus,
    matchedAssetId: (rec.get('matchedAssetId') as string | null) ?? null,
    createdAt: rec.get('createdAt') as string,
  };
}

export async function listDiscoveredAssets(
  tenantId: string,
  reportId: string,
): Promise<DiscoveredAsset[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (d:DiscoveredAsset {tenantId: $tenantId, reportId: $reportId})
       RETURN ${DISCOVERED_RETURN}
       ORDER BY d.createdAt ASC`,
      { tenantId, reportId },
    );
    return r.records.map(recordToDiscovered);
  } finally {
    await session.close();
  }
}

export async function setDiscoveredStatus(
  tenantId: string,
  id: string,
  status: DiscoveredStatus,
  matchedAssetId: string | null = null,
): Promise<DiscoveredAsset | null> {
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `MATCH (d:DiscoveredAsset {tenantId: $tenantId, id: $id})
         SET d.status = $status, d.matchedAssetId = $matchedAssetId
         RETURN ${DISCOVERED_RETURN}`,
        { tenantId, id, status, matchedAssetId },
      ),
    );
    return r.records.length === 0 ? null : recordToDiscovered(r.records[0]!);
  } finally {
    await session.close();
  }
}

export async function markReportReviewed(
  tenantId: string,
  reportId: string,
  reviewerUserId: string,
): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (r:ScanReport {tenantId: $tenantId, id: $reportId})
         SET r.status = 'reviewed', r.reviewedAt = datetime(),
             r.reviewerUserId = $reviewerUserId`,
        { tenantId, reportId, reviewerUserId },
      );
    });
  } finally {
    await session.close();
  }
}

/** Pending discovered ids in a report — for bulk-accept iteration. */
export async function listPendingDiscoveredIds(
  tenantId: string,
  reportId: string,
): Promise<string[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (d:DiscoveredAsset {tenantId: $tenantId, reportId: $reportId})
       WHERE coalesce(d.status, 'pending') = 'pending'
       RETURN d.id AS id`,
      { tenantId, reportId },
    );
    return r.records.map((rec) => rec.get('id') as string);
  } finally {
    await session.close();
  }
}

/** Test if all discovered assets in a report have moved off pending. */
export async function isReportFullyReviewed(
  tenantId: string,
  reportId: string,
): Promise<boolean> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (d:DiscoveredAsset {tenantId: $tenantId, reportId: $reportId})
       WHERE coalesce(d.status, 'pending') = 'pending'
       RETURN count(d) AS pending`,
      { tenantId, reportId },
    );
    return Number(r.records[0]?.get('pending') ?? 0) === 0;
  } finally {
    await session.close();
  }
}
