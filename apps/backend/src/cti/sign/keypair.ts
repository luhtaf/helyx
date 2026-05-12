import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createHash,
} from 'node:crypto';
import { config } from '../../config.js';
import { getSession } from '../../db/neo4j.js';
import { logAudit } from '../../audits/log.js';

// F2 — Per-org Ed25519 keypair for signing exported CTI bundles.
//
// Rotation model (m021): each tenant has many :CtiOrgKeypair, exactly one
// with status='active'. Older keys keep status='previous' (still queried
// when verifying historical bundles via :SIGNED_BY edge) or 'revoked'
// (operator declared it compromised — verifiers should mistrust signatures
// that point at a revoked key).
//
// At-rest model: private key is AES-256-GCM encrypted with
// CTI_SIGNING_MASTER_KEY (env). Master key is a separate secret tier from
// JWT_SECRET — compromising one must not compromise the other.

export type KeypairStatus = 'active' | 'previous' | 'revoked';

interface EncryptedBlob {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function getMasterKey(): Buffer {
  const hex = config.CTI_SIGNING_MASTER_KEY;
  if (!hex) {
    throw new Error(
      'CTI_SIGNING_MASTER_KEY missing — required for CTI export signing. ' +
      'Generate with: node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'hex\'))" ' +
      'and add to .env',
    );
  }
  return Buffer.from(hex, 'hex');
}

function encryptPrivateKey(plaintext: Buffer): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptPrivateKey(blob: EncryptedBlob): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'base64')),
    decipher.final(),
  ]);
}

export interface OrgKeypair {
  id: string;
  tenantId: string;
  publicKeyPem: string;
  /** sha256(publicKeyPem) hex — short identifier for operators. */
  fingerprint: string;
  /** Decrypted in-memory only. Never persist or log. */
  privateKey: ReturnType<typeof createPrivateKey>;
  algorithm: 'ed25519';
  status: KeypairStatus;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

/** Public-facing summary — no private key, safe to ship to FE. */
export interface OrgKeypairSummary {
  id: string;
  tenantId: string;
  publicKeyPem: string;
  fingerprint: string;
  algorithm: 'ed25519';
  status: KeypairStatus;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

interface KeypairRow {
  id: string;
  publicKeyPem: string;
  privateKeyCipher: string;
  privateKeyIv: string;
  privateKeyTag: string;
  status: KeypairStatus;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

function fingerprintOf(publicKeyPem: string): string {
  return createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
}

function rowToSummary(row: KeypairRow, tenantId: string): OrgKeypairSummary {
  return {
    id: row.id,
    tenantId,
    publicKeyPem: row.publicKeyPem,
    fingerprint: fingerprintOf(row.publicKeyPem),
    algorithm: 'ed25519',
    status: row.status,
    createdAt: row.createdAt,
    rotatedAt: row.rotatedAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
  };
}

function rowToKeypair(row: KeypairRow, tenantId: string): OrgKeypair {
  const privPemBuf = decryptPrivateKey({
    ciphertext: row.privateKeyCipher,
    iv: row.privateKeyIv,
    authTag: row.privateKeyTag,
  });
  return {
    ...rowToSummary(row, tenantId),
    privateKey: createPrivateKey({ key: privPemBuf }),
  };
}

const RETURN_FIELDS = `
  k.id AS id, k.publicKeyPem AS publicKeyPem,
  k.privateKeyCipher AS privateKeyCipher,
  k.privateKeyIv AS privateKeyIv,
  k.privateKeyTag AS privateKeyTag,
  coalesce(k.status, 'active') AS status,
  toString(k.createdAt) AS createdAt,
  toString(k.rotatedAt) AS rotatedAt,
  toString(k.revokedAt) AS revokedAt,
  k.revokedReason AS revokedReason
`;

function recordToRow(rec: { get: (k: string) => unknown }): KeypairRow {
  return {
    id: rec.get('id') as string,
    publicKeyPem: rec.get('publicKeyPem') as string,
    privateKeyCipher: rec.get('privateKeyCipher') as string,
    privateKeyIv: rec.get('privateKeyIv') as string,
    privateKeyTag: rec.get('privateKeyTag') as string,
    status: rec.get('status') as KeypairStatus,
    createdAt: rec.get('createdAt') as string,
    rotatedAt: (rec.get('rotatedAt') as string | null) ?? null,
    revokedAt: (rec.get('revokedAt') as string | null) ?? null,
    revokedReason: (rec.get('revokedReason') as string | null) ?? null,
  };
}

async function readActiveKeypair(tenantId: string): Promise<KeypairRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (k:CtiOrgKeypair {tenantId: $tenantId})
       WHERE coalesce(k.status, 'active') = 'active'
       RETURN ${RETURN_FIELDS}
       LIMIT 1`,
      { tenantId },
    );
    return r.records.length === 0 ? null : recordToRow(r.records[0]!);
  } finally {
    await session.close();
  }
}

async function readKeypairById(tenantId: string, id: string): Promise<KeypairRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (k:CtiOrgKeypair {tenantId: $tenantId, id: $id})
       RETURN ${RETURN_FIELDS}`,
      { tenantId, id },
    );
    return r.records.length === 0 ? null : recordToRow(r.records[0]!);
  } finally {
    await session.close();
  }
}

interface MintedKeypair {
  id: string;
  publicKeyPem: string;
  cipher: string;
  iv: string;
  tag: string;
  createdAt: string;
}

function mintKeypair(): MintedKeypair {
  getMasterKey(); // validate env early — fail before generating entropy
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const blob = encryptPrivateKey(Buffer.from(privPem, 'utf8'));
  return {
    id: randomUUID(),
    publicKeyPem: pubPem,
    cipher: blob.ciphertext,
    iv: blob.iv,
    tag: blob.authTag,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Returns the tenant's active keypair, lazily generating one if none exists.
 * Race-safe: concurrent first-callers hit the WITH count branch and only
 * one CREATE wins.
 */
export async function getActiveOrCreateOrgKeypair(tenantId: string): Promise<OrgKeypair> {
  const existing = await readActiveKeypair(tenantId);
  if (existing) return rowToKeypair(existing, tenantId);

  const minted = mintKeypair();

  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      // Create-if-no-active. The WHERE count(...) = 0 makes this a CAS:
      // if a concurrent caller already created the active key, our CREATE
      // is a no-op and we fall through to the readback.
      await tx.run(
        `OPTIONAL MATCH (existing:CtiOrgKeypair {tenantId: $tenantId})
         WHERE coalesce(existing.status, 'active') = 'active'
         WITH count(existing) AS cnt
         WHERE cnt = 0
         CREATE (k:CtiOrgKeypair {
           id: $id, tenantId: $tenantId, publicKeyPem: $publicKeyPem,
           privateKeyCipher: $cipher, privateKeyIv: $iv, privateKeyTag: $tag,
           algorithm: 'ed25519', status: 'active',
           createdAt: datetime($createdAt)
         })`,
        { tenantId, ...minted },
      );
    });
  } finally {
    await session.close();
  }

  const after = await readActiveKeypair(tenantId);
  if (!after) throw new Error('active keypair vanished after CAS create (impossible)');
  return rowToKeypair(after, tenantId);
}

/** Verify-time lookup — returns summary (no private key). For SIGNED_BY trail. */
export async function getKeypairSummary(tenantId: string, id: string): Promise<OrgKeypairSummary | null> {
  const row = await readKeypairById(tenantId, id);
  return row ? rowToSummary(row, tenantId) : null;
}

export async function listOrgKeypairs(tenantId: string): Promise<OrgKeypairSummary[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (k:CtiOrgKeypair {tenantId: $tenantId})
       RETURN ${RETURN_FIELDS}
       ORDER BY k.createdAt DESC`,
      { tenantId },
    );
    return r.records.map((rec) => rowToSummary(recordToRow(rec), tenantId));
  } finally {
    await session.close();
  }
}

interface RotationOutcome {
  newKeypair: OrgKeypairSummary;
  rotatedKeypairId: string | null;
}

/**
 * Demote current active to 'previous', mint + activate a new keypair.
 * Atomic: one transaction. Lazy first call: if no active exists, just
 * creates a new one (rotatedKeypairId = null).
 */
export async function rotateOrgKeypair(
  tenantId: string,
  actorUserId: string,
  reason: string,
): Promise<RotationOutcome> {
  const minted = mintKeypair();
  const rotatedAt = new Date().toISOString();

  const session = getSession();
  let demotedId: string | null = null;
  try {
    const r = await session.executeWrite(async (tx) => {
      // Demote current active (if any), capture its id for audit.
      const demote = await tx.run(
        `MATCH (k:CtiOrgKeypair {tenantId: $tenantId})
         WHERE coalesce(k.status, 'active') = 'active'
         SET k.status = 'previous', k.rotatedAt = datetime($rotatedAt)
         RETURN k.id AS id`,
        { tenantId, rotatedAt },
      );
      demotedId = demote.records.length === 0
        ? null
        : (demote.records[0]!.get('id') as string);

      // Create the new active keypair.
      await tx.run(
        `CREATE (k:CtiOrgKeypair {
           id: $id, tenantId: $tenantId, publicKeyPem: $publicKeyPem,
           privateKeyCipher: $cipher, privateKeyIv: $iv, privateKeyTag: $tag,
           algorithm: 'ed25519', status: 'active',
           createdAt: datetime($createdAt)
         })`,
        { tenantId, ...minted },
      );

      // Append to per-tenant rotation ledger.
      await tx.run(
        `CREATE (r:KeypairRotation {
           id: $id, tenantId: $tenantId, ts: datetime($ts),
           actorUserId: $actorUserId,
           oldKeypairId: $oldKeypairId, newKeypairId: $newKeypairId,
           reason: $reason
         })`,
        {
          id: randomUUID(),
          tenantId,
          ts: rotatedAt,
          actorUserId,
          oldKeypairId: demotedId,
          newKeypairId: minted.id,
          reason,
        },
      );

      return await tx.run(
        `MATCH (k:CtiOrgKeypair {tenantId: $tenantId, id: $id})
         RETURN ${RETURN_FIELDS}`,
        { tenantId, id: minted.id },
      );
    });

    if (r.records.length === 0) throw new Error('rotation succeeded but readback empty');
    const summary = rowToSummary(recordToRow(r.records[0]!), tenantId);

    await logAudit(
      tenantId,
      actorUserId,
      'cti_keypair.rotate',
      { type: 'CtiOrgKeypair', id: summary.id },
      demotedId ? { demotedKeypairId: demotedId } : null,
      { newKeypairId: summary.id, fingerprint: summary.fingerprint, reason },
    );

    return { newKeypair: summary, rotatedKeypairId: demotedId };
  } finally {
    await session.close();
  }
}

/**
 * Mark a keypair revoked. Revoking the active key would leave the tenant
 * unable to sign — caller must rotate first then revoke the demoted key.
 * Returns the revoked keypair summary, or null if id not found / already
 * revoked.
 */
export async function revokeOrgKeypair(
  tenantId: string,
  keypairId: string,
  actorUserId: string,
  reason: string,
): Promise<OrgKeypairSummary | null> {
  const before = await readKeypairById(tenantId, keypairId);
  if (!before) return null;
  if (before.status === 'active') {
    throw new Error('cannot revoke the active keypair — rotate first');
  }
  if (before.status === 'revoked') return rowToSummary(before, tenantId);

  const revokedAt = new Date().toISOString();
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MATCH (k:CtiOrgKeypair {tenantId: $tenantId, id: $id})
         SET k.status = 'revoked', k.revokedAt = datetime($revokedAt),
             k.revokedReason = $reason`,
        { tenantId, id: keypairId, revokedAt, reason },
      );
    });
  } finally {
    await session.close();
  }

  const after = await readKeypairById(tenantId, keypairId);
  if (!after) throw new Error('keypair vanished after revoke (impossible)');
  const summary = rowToSummary(after, tenantId);

  await logAudit(
    tenantId,
    actorUserId,
    'cti_keypair.revoke',
    { type: 'CtiOrgKeypair', id: keypairId },
    { status: before.status },
    { status: 'revoked', fingerprint: summary.fingerprint, reason },
  );

  return summary;
}
