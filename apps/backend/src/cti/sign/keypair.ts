import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
} from 'node:crypto';
import { config } from '../../config.js';
import { getSession } from '../../db/neo4j.js';

// F2 — Per-org Ed25519 keypair for signing exported CTI bundles.
//
// At-rest model: private key is AES-256-GCM encrypted with
// CTI_SIGNING_MASTER_KEY (env). Master key is a separate secret tier from
// JWT_SECRET — compromising one must not compromise the other (Copilot
// finding during plan review).
//
// One keypair per tenant. Lazy-generated on first signing call. MERGE on
// (tenantId) + ON CREATE SET makes concurrent first-callers race-safe;
// loser re-reads the winner's keypair.
//
// Key rotation is a future story — when it lands, this module gains a
// "current vs previous" pair so existing signatures remain verifiable
// for a grace window.

interface EncryptedBlob {
  ciphertext: string; // base64
  iv: string;         // base64 (12 bytes for GCM)
  authTag: string;    // base64 (16 bytes)
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
  const iv = randomBytes(12); // 96-bit IV is the GCM standard
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
  /** Decrypted in-memory only. Never persist or log. */
  privateKey: ReturnType<typeof createPrivateKey>;
  algorithm: 'ed25519';
  createdAt: string;
}

interface KeypairRow {
  id: string;
  publicKeyPem: string;
  privateKeyCipher: string;
  privateKeyIv: string;
  privateKeyTag: string;
  createdAt: string;
}

async function readKeypair(tenantId: string): Promise<KeypairRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (k:CtiOrgKeypair {tenantId: $tenantId})
       RETURN k.id AS id, k.publicKeyPem AS publicKeyPem,
              k.privateKeyCipher AS privateKeyCipher,
              k.privateKeyIv AS privateKeyIv,
              k.privateKeyTag AS privateKeyTag,
              toString(k.createdAt) AS createdAt`,
      { tenantId },
    );
    if (r.records.length === 0) return null;
    const rec = r.records[0]!;
    return {
      id: rec.get('id') as string,
      publicKeyPem: rec.get('publicKeyPem') as string,
      privateKeyCipher: rec.get('privateKeyCipher') as string,
      privateKeyIv: rec.get('privateKeyIv') as string,
      privateKeyTag: rec.get('privateKeyTag') as string,
      createdAt: rec.get('createdAt') as string,
    };
  } finally {
    await session.close();
  }
}

function rowToKeypair(row: KeypairRow, tenantId: string): OrgKeypair {
  const privPemBuf = decryptPrivateKey({
    ciphertext: row.privateKeyCipher,
    iv: row.privateKeyIv,
    authTag: row.privateKeyTag,
  });
  return {
    id: row.id,
    tenantId,
    publicKeyPem: row.publicKeyPem,
    privateKey: createPrivateKey({ key: privPemBuf }),
    algorithm: 'ed25519',
    createdAt: row.createdAt,
  };
}

export async function getOrCreateOrgKeypair(tenantId: string): Promise<OrgKeypair> {
  // Fast path: existing keypair (also validates master key works on every call).
  const existing = await readKeypair(tenantId);
  if (existing) return rowToKeypair(existing, tenantId);

  // Slow path: generate + persist + re-read (race-safe via MERGE).
  // Validate master key BEFORE generating, so a misconfigured env fails
  // before we waste keypair entropy.
  getMasterKey();

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const blob = encryptPrivateKey(Buffer.from(privPem, 'utf8'));
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      // MERGE on tenantId — concurrent first-creators race-safe; only
      // one set of properties wins via ON CREATE SET. The loser falls
      // through to readKeypair below.
      await tx.run(
        `MERGE (k:CtiOrgKeypair {tenantId: $tenantId})
         ON CREATE SET k.id = $id, k.publicKeyPem = $publicKeyPem,
                       k.privateKeyCipher = $cipher, k.privateKeyIv = $iv,
                       k.privateKeyTag = $tag,
                       k.algorithm = 'ed25519', k.createdAt = datetime($createdAt)`,
        {
          tenantId, id, publicKeyPem: pubPem,
          cipher: blob.ciphertext, iv: blob.iv, tag: blob.authTag,
          createdAt,
        },
      );
    });
  } finally {
    await session.close();
  }

  // Re-read so we always return the persisted (race-survivor) record.
  const after = await readKeypair(tenantId);
  if (!after) throw new Error('keypair vanished between MERGE and readback (impossible)');
  return rowToKeypair(after, tenantId);
}
