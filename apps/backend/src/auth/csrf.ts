import { randomBytes } from 'node:crypto';
import { cacheDel, cacheGet, cacheSet } from '../cache/index.js';

const CSRF_TTL_S = 7 * 24 * 60 * 60;

const csrfKey = (userId: string) => `auth:csrf:${userId}`;

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export async function storeCsrfToken(userId: string, token: string): Promise<void> {
  await cacheSet(csrfKey(userId), token, CSRF_TTL_S);
}

export async function loadCsrfToken(userId: string): Promise<string | null> {
  return cacheGet<string>(csrfKey(userId));
}

export async function clearCsrfToken(userId: string): Promise<void> {
  await cacheDel(csrfKey(userId));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
