import { logger } from '../../logger.js';
import { markSyncStart, readSyncState, setSyncCursor, clearSyncCursor } from '../../sync/state.js';
import { mapBatch } from '../nvd/mapper.js';
import { writeBatch } from '../nvd/ingest.js';
import type { NvdCve } from '../nvd/types.js';
import { closePit, openPit, searchPage, totalCount } from './client.js';
import type { ElkSortValue } from './types.js';

const SOURCE = 'elk-cve-bulk';
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_BATCHES = Infinity;

export interface SyncOptions {
  pageSize?: number;
  maxBatches?: number;
  reset?: boolean;
}

export interface SyncResult {
  batches: number;
  cves: number;
  totalInIndex: number;
  cursor: string | null;
  resumed: boolean;
}

export async function syncElk(opts: SyncOptions = {}): Promise<SyncResult> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxBatches = opts.maxBatches ?? DEFAULT_MAX_BATCHES;

  if (opts.reset) {
    await clearSyncCursor(SOURCE);
    logger.warn({ source: SOURCE }, 'elk: cursor cleared, starting from scratch');
  }

  const state = await readSyncState(SOURCE);
  let searchAfter: ElkSortValue | undefined = state?.cursor ? parseCursor(state.cursor) : undefined;
  const resumed = Boolean(state?.cursor);

  await markSyncStart(SOURCE);
  const total = await totalCount();
  logger.info({ total, pageSize, resumeFrom: state?.cursor ?? null }, 'elk: sync starting');

  const pitId = await openPit();
  let batches = 0;
  let cves = 0;

  try {
    while (batches < maxBatches) {
      const page = await searchPage({ pitId, size: pageSize, searchAfter });
      const hits = page.hits.hits;
      if (hits.length === 0) {
        logger.info({ batches, cves }, 'elk: no more hits, sync complete');
        break;
      }

      const docs: NvdCve[] = hits.map((h) => h._source.original as NvdCve);
      const mapped = mapBatch(docs);
      await writeBatch(mapped);

      const lastHit = hits[hits.length - 1]!;
      if (!lastHit.sort) throw new Error('ELK hit missing sort field — check sort clause');
      searchAfter = lastHit.sort;
      const cursor = JSON.stringify(lastHit.sort);
      await setSyncCursor(SOURCE, cursor);

      batches++;
      cves += hits.length;

      logger.info({
        batch: batches,
        pageSize: hits.length,
        cves,
        cursor,
        progressPct: total ? Number(((cves / total) * 100).toFixed(2)) : null,
      }, 'elk: page ingested');
    }
  } finally {
    await closePit(pitId);
  }

  return { batches, cves, totalInIndex: total, cursor: searchAfter ? JSON.stringify(searchAfter) : null, resumed };
}

function parseCursor(raw: string): ElkSortValue {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ElkSortValue;
  } catch {
    /* fall through */
  }
  return [raw];
}
