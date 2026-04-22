import { logger } from '../../logger.js';
import { StixBundle } from './types.js';

const ENTERPRISE_URL =
  'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json';

function backoff(attempt: number): number {
  return Math.min(60_000, 2 ** attempt * 1_000) + Math.random() * 500;
}

export async function fetchEnterpriseBundle(url: string = ENTERPRISE_URL): Promise<StixBundle> {
  const maxAttempts = 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info({ url, attempt }, 'mitre: fetching STIX bundle');
      const res = await fetch(url, { headers: { 'user-agent': 'helyx-backend/0.0.0' } });
      if (res.status === 429 || res.status >= 500) {
        const delay = backoff(attempt);
        logger.warn({ status: res.status, attempt, delayMs: Math.round(delay) }, 'mitre retry');
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) {
        throw new Error(`mitre fetch ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const json = await res.json();
      return StixBundle.parse(json);
    } catch (err) {
      lastErr = err;
      const delay = backoff(attempt);
      logger.warn({ err: String(err), attempt, delayMs: Math.round(delay) }, 'mitre fetch error');
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`mitre fetch failed after ${maxAttempts} attempts: ${String(lastErr)}`);
}
