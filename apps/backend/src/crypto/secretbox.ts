import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config.js';

// Generic AES-256-GCM at-rest secret box. Same crypto + master-key tier
// as cti/sign/keypair.ts (CTI_SIGNING_MASTER_KEY) — "data-at-rest"
// secrets, deliberately separate from JWT_SECRET (different blast
// radius). Used for admin-managed integration secrets that must be
// reversible at use time (e.g. OIDC client secret).
//
// Wire format: base64(iv).base64(authTag).base64(ciphertext) — a single
// opaque string so it drops into one Neo4j property.

function masterKey(): Buffer {
  const hex = config.CTI_SIGNING_MASTER_KEY;
  if (!hex) {
    throw new Error(
      'CTI_SIGNING_MASTER_KEY missing — required to encrypt admin secrets ' +
      '(OIDC client secret, etc). Generate with: ' +
      'node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return Buffer.from(hex, 'hex');
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ct.toString('base64'),
  ].join('.');
}

export function open(blob: string): string {
  const [ivB64, tagB64, ctB64] = blob.split('.');
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('secretbox: malformed blob');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    masterKey(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
