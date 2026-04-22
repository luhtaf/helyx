import { logger } from '../../logger.js';
import { markSyncComplete, markSyncStart, readSyncState } from '../../sync/state.js';
import { fetchCvePage } from './client.js';
import { writeBatch } from './ingest.js';
import { mapBatch } from './mapper.js';

const SOURCE = 'nvd-cve';
const PAGE_SIZE = 1000;
const NVD_MAX_WINDOW_DAYS = 120;

export interface SyncOptions {
  since?: string;
  until?: string;
  fallbackDays?: number;
}

export interface SyncResult {
  pages: number;
  cves: number;
  since: string;
  until: string;
}

export async function syncNvd(opts: SyncOptions = {}): Promise<SyncResult> {
  const fallbackDays = opts.fallbackDays ?? 7;
  const state = await readSyncState(SOURCE);

  const since = opts.since
    ?? state?.lastModEndDate
    ?? new Date(Date.now() - fallbackDays * 86_400_000).toISOString();
  const until = opts.until ?? new Date().toISOString();

  const windows = splitWindow(since, until);
  await markSyncStart(SOURCE);

  let totalPages = 0;
  let totalCves = 0;

  for (const w of windows) {
    logger.info({ start: w.start, end: w.end }, 'nvd window start');
    let startIndex = 0;
    let totalResults = Infinity;

    while (startIndex < totalResults) {
      const page = await fetchCvePage({
        startIndex,
        resultsPerPage: PAGE_SIZE,
        lastModStartDate: w.start,
        lastModEndDate: w.end,
      });
      totalResults = page.totalResults;
      if (page.vulnerabilities.length === 0) break;

      const batch = mapBatch(page.vulnerabilities.map((v) => v.cve));
      await writeBatch(batch);

      totalPages++;
      totalCves += page.vulnerabilities.length;

      logger.info({
        startIndex,
        pageSize: page.vulnerabilities.length,
        totalResults,
        totalCvesSoFar: totalCves,
      }, 'nvd page ingested');

      startIndex += page.vulnerabilities.length;
    }
  }

  await markSyncComplete(SOURCE, until);
  logger.info({ totalPages, totalCves, since, until }, 'nvd sync complete');
  return { pages: totalPages, cves: totalCves, since, until };
}

function splitWindow(start: string, end: string): { start: string; end: string }[] {
  const windowMs = NVD_MAX_WINDOW_DAYS * 86_400_000;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (endMs - startMs <= windowMs) return [{ start, end }];

  const out: { start: string; end: string }[] = [];
  let cur = startMs;
  while (cur < endMs) {
    const next = Math.min(cur + windowMs, endMs);
    out.push({ start: new Date(cur).toISOString(), end: new Date(next).toISOString() });
    cur = next;
  }
  return out;
}
