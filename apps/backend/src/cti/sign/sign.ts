import { sign as cryptoSign, verify as cryptoVerify, type KeyObject, createPublicKey } from 'node:crypto';

// F2 — Ed25519 detached signatures over arbitrary bytes (CTI bundle JSON).
//
// "Detached" = signature is separate from the signed bytes. Consumers verify
// with: verifyBytes(orgPublicKey, bundleBytes, signature) → bool.
// Algorithm parameter is null because Ed25519 is a deterministic, hash-built-in
// signature scheme — Node's crypto API rejects an explicit hash here.

export function signBytes(privateKey: KeyObject, bytes: Buffer): string {
  const sig = cryptoSign(null, bytes, privateKey);
  return sig.toString('base64');
}

export function verifyBytes(publicKeyPem: string, bytes: Buffer, signatureBase64: string): boolean {
  const pub = createPublicKey({ key: publicKeyPem });
  return cryptoVerify(null, bytes, pub, Buffer.from(signatureBase64, 'base64'));
}
