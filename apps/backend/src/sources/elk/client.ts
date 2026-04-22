import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { PitOpenResponse, SearchResponse, type ElkSortValue } from './types.js';

const KEEP_ALIVE = '5m';

function authHeader(): Record<string, string> {
  if (!config.ELK_USERNAME || !config.ELK_PASSWORD) return {};
  const token = Buffer.from(`${config.ELK_USERNAME}:${config.ELK_PASSWORD}`).toString('base64');
  return { authorization: `Basic ${token}` };
}

function backoff(attempt: number): number {
  return Math.min(30_000, 2 ** attempt * 500) + Math.random() * 250;
}

async function request<T>(
  path: string,
  init: RequestInit,
  parse: (raw: unknown) => T,
  attemptLabel: string,
): Promise<T> {
  const url = `${config.ELK_BASE_URL.replace(/\/$/, '')}${path}`;
  const maxAttempts = 4;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'helyx-backend/0.0.0',
          ...authHeader(),
          ...(init.headers ?? {}),
        },
      });
      if (res.status === 429 || res.status >= 500) {
        const delay = backoff(attempt);
        logger.warn({ status: res.status, attempt, delayMs: Math.round(delay), op: attemptLabel }, 'elk retry: server signal');
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`ELK ${res.status} on ${attemptLabel}: ${body.slice(0, 300)}`);
      }
      return parse(await res.json());
    } catch (err) {
      lastErr = err;
      const delay = backoff(attempt);
      logger.warn({ err: String(err), attempt, delayMs: Math.round(delay), op: attemptLabel }, 'elk retry: fetch error');
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`ELK ${attemptLabel} failed after ${maxAttempts} attempts: ${String(lastErr)}`);
}

export async function openPit(): Promise<string> {
  const res = await request(
    `/${encodeURIComponent(config.ELK_CVE_INDEX)}/_pit?keep_alive=${KEEP_ALIVE}`,
    { method: 'POST' },
    (raw) => PitOpenResponse.parse(raw),
    'pit:open',
  );
  return res.id;
}

export async function closePit(pitId: string): Promise<void> {
  try {
    await request(
      '/_pit',
      { method: 'DELETE', body: JSON.stringify({ id: pitId }) },
      () => null,
      'pit:close',
    );
  } catch (err) {
    logger.warn({ err: String(err) }, 'elk pit close failed (non-fatal)');
  }
}

export interface SearchPageParams {
  pitId: string;
  size: number;
  searchAfter?: ElkSortValue;
}

export async function searchPage(params: SearchPageParams): Promise<SearchResponse> {
  const body = {
    size: params.size,
    sort: [{ lastModified: 'asc' }, { 'id.keyword': 'asc' }],
    pit: { id: params.pitId, keep_alive: KEEP_ALIVE },
    track_total_hits: false,
    ...(params.searchAfter ? { search_after: params.searchAfter } : {}),
  };
  return request(
    '/_search',
    { method: 'POST', body: JSON.stringify(body) },
    (raw) => SearchResponse.parse(raw),
    'search',
  );
}

export async function totalCount(): Promise<number> {
  const res = await request(
    `/${encodeURIComponent(config.ELK_CVE_INDEX)}/_count`,
    { method: 'GET' },
    (raw) => raw as { count: number },
    'count',
  );
  return res.count;
}
