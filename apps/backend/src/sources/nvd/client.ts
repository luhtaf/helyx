import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { NvdCvePage } from './types.js';

export interface FetchPageParams {
  startIndex: number;
  resultsPerPage: number;
  lastModStartDate?: string;
  lastModEndDate?: string;
  pubStartDate?: string;
  pubEndDate?: string;
}

const requestDelayMs = config.NVD_API_KEY ? 650 : 6_500;
let lastRequestAt = 0;

async function rateLimitWait(): Promise<void> {
  const wait = lastRequestAt + requestDelayMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

function backoff(attempt: number, capMs = 60_000): number {
  return Math.min(capMs, 2 ** attempt * 1_000) + Math.random() * 500;
}

export async function fetchCvePage(params: FetchPageParams): Promise<NvdCvePage> {
  const url = new URL(config.NVD_BASE_URL);
  url.searchParams.set('startIndex', params.startIndex.toString());
  url.searchParams.set('resultsPerPage', params.resultsPerPage.toString());
  if (params.lastModStartDate) url.searchParams.set('lastModStartDate', params.lastModStartDate);
  if (params.lastModEndDate) url.searchParams.set('lastModEndDate', params.lastModEndDate);
  if (params.pubStartDate) url.searchParams.set('pubStartDate', params.pubStartDate);
  if (params.pubEndDate) url.searchParams.set('pubEndDate', params.pubEndDate);

  const headers: Record<string, string> = { 'User-Agent': 'helyx-backend/0.0.0' };
  if (config.NVD_API_KEY) headers['apiKey'] = config.NVD_API_KEY;

  const maxAttempts = 5;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await rateLimitWait();
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429 || res.status >= 500) {
        const delay = backoff(attempt);
        logger.warn({ status: res.status, attempt, delayMs: Math.round(delay) }, 'nvd retry: server signal');
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`NVD ${res.status}: ${body.slice(0, 300)}`);
      }
      return NvdCvePage.parse(await res.json());
    } catch (err) {
      lastError = err;
      const delay = backoff(attempt, 30_000);
      logger.warn({ err: String(err), attempt, delayMs: Math.round(delay) }, 'nvd retry: fetch error');
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`NVD fetch failed after ${maxAttempts} attempts: ${String(lastError)}`);
}
