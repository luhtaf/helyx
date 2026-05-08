import { logger } from '../../logger.js';
import { markSyncStart, readSyncState, setSyncCursor, clearSyncCursor } from '../../sync/state.js';
import { closePit, openPit, searchPage, totalCount } from './client.js';
import { mapBatch } from './mapper.js';
import { writeBatch, type WriteStats } from './ingest.js';
import type { ElkSortValue, SpiderfootRecord } from './types.js';

const SOURCE_PREFIX = 'elk-spiderfoot';
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_BATCHES = Infinity;

export interface SyncOptions {
  tenantId: string;
  organisasi?: string;     // narrow to a specific Organisasi if set
  pageSize?: number;
  maxBatches?: number;
  reset?: boolean;
}

export interface SyncResult {
  batches: number;
  scanned: number;
  totals: WriteStats;
  totalInIndex: number;
  cursor: string | null;
  resumed: boolean;
  skipped: number;
}

export async function syncSpiderfoot(opts: SyncOptions): Promise<SyncResult> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxBatches = opts.maxBatches ?? DEFAULT_MAX_BATCHES;

  // Cursor is per-tenant so two tenants can resume independently. Format:
  //   elk-spiderfoot:<tenantId>            — all Organisasi for that tenant
  //   elk-spiderfoot:<tenantId>:<slugified> — narrowed to one Organisasi
  const orgSuffix = opts.organisasi
    ? ':' + opts.organisasi.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : '';
  const sourceKey = `${SOURCE_PREFIX}:${opts.tenantId}${orgSuffix}`;

  if (opts.reset) {
    await clearSyncCursor(sourceKey);
    logger.warn({ source: sourceKey }, 'sf-elk: cursor cleared, starting from scratch');
  }

  const state = await readSyncState(sourceKey);
  let searchAfter: ElkSortValue | undefined = state?.cursor ? parseCursor(state.cursor) : undefined;
  const resumed = Boolean(state?.cursor);

  await markSyncStart(sourceKey);
  const total = await totalCount();
  logger.info({
    total, pageSize,
    tenantId: opts.tenantId,
    organisasi: opts.organisasi ?? null,
    resumeFrom: state?.cursor ?? null,
  }, 'sf-elk: sync starting');

  const pitId = await openPit();
  let batches = 0;
  let scanned = 0;
  let skipped = 0;
  const totals: WriteStats = {
    stakeholdersUpserted: 0,
    assetsUpserted: 0,
    ownsUpserted: 0,
    componentsUpserted: 0,
    ofProductLinks: 0,
    attributedCves: 0,
    attributedMissingCves: 0,
  };

  // Optional Organisasi filter (term query on .keyword sub-field).
  // ELK mapping for Spiderfoot index keeps text fields with .keyword in
  // most setups; if not, fall back to match on the analyzed field.
  const query = opts.organisasi
    ? { term: { 'Organisasi.keyword': opts.organisasi } }
    : undefined;

  try {
    while (batches < maxBatches) {
      const page = await searchPage({ pitId, size: pageSize, searchAfter, query });
      const hits = page.hits.hits;
      if (hits.length === 0) {
        logger.info({ batches, scanned, totals }, 'sf-elk: no more hits, sync complete');
        break;
      }

      const docs: SpiderfootRecord[] = hits.map((h) => h._source);
      const mapped = mapBatch(docs, opts.tenantId);
      const stats = await writeBatch(mapped);

      totals.stakeholdersUpserted += stats.stakeholdersUpserted;
      totals.assetsUpserted += stats.assetsUpserted;
      totals.ownsUpserted += stats.ownsUpserted;
      totals.componentsUpserted += stats.componentsUpserted;
      totals.ofProductLinks += stats.ofProductLinks;
      totals.attributedCves += stats.attributedCves;
      totals.attributedMissingCves += stats.attributedMissingCves;
      skipped += mapped.skipped;

      const lastHit = hits[hits.length - 1]!;
      if (!lastHit.sort) throw new Error('SF-ELK hit missing sort field — check sort clause');
      searchAfter = lastHit.sort;
      const cursor = JSON.stringify(lastHit.sort);
      await setSyncCursor(sourceKey, cursor);

      batches++;
      scanned += hits.length;

      logger.info({
        batch: batches,
        pageSize: hits.length,
        scanned,
        skipped,
        totals,
        cursor,
      }, 'sf-elk: page ingested');
    }
  } finally {
    await closePit(pitId);
  }

  return {
    batches,
    scanned,
    totals,
    totalInIndex: total,
    cursor: searchAfter ? JSON.stringify(searchAfter) : null,
    resumed,
    skipped,
  };
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
