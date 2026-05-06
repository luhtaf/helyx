import { z } from 'zod';
import { getSession } from '../../db/neo4j.js';
import { elkAggregate } from './client.js';
import { normalizeKey } from '../../reconciliation/fuzzy.js';
import { logger } from '../../logger.js';

const BUCKET_QUERY = (sinceIso: string) => ({
  size: 0,
  query: { range: { '@timestamp': { gte: sinceIso } } },
  aggs: {
    sektor: {
      terms: { field: 'Sektor.keyword', size: 100 },
      aggs: {
        org: {
          terms: { field: 'Organisasi.keyword', size: 1000 },
          aggs: {
            target: { terms: { field: 'Target.keyword', size: 50 } },
            last_seen: { max: { field: '@timestamp' } },
          },
        },
      },
    },
  },
});

const BucketShape = z.object({
  aggregations: z.object({
    sektor: z.object({
      buckets: z.array(z.object({
        key: z.string(),
        doc_count: z.number(),
        org: z.object({
          buckets: z.array(z.object({
            key: z.string(),
            doc_count: z.number(),
            target: z.object({ buckets: z.array(z.object({ key: z.string() })) }),
            last_seen: z.object({ value_as_string: z.string() }),
          })),
        }),
      })),
    }),
  }),
}).passthrough();

export interface BootstrapOptions {
  tenantId: string;
  sinceDays?: number;
  index?: string;
  dryRun?: boolean;
}

export interface BootstrapResult {
  scanned: number;
  upserted: number;
  durationMs: number;
}

interface StakeholderRow {
  source: string;
  rawName: string;
  normalizedKey: string;
  rawSektor: string;
  hitCount: number;
  targetCount: number;
  lastSeen: string;
}

export async function bootstrapStakeholders(opts: BootstrapOptions): Promise<BootstrapResult> {
  const start = Date.now();
  const sinceDays = opts.sinceDays ?? 180;
  const sinceIso = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  const index = opts.index ?? 'nasional_cve_new-*';

  const raw = await elkAggregate(index, BUCKET_QUERY(sinceIso));
  const parsed = BucketShape.parse(raw);

  const rows: StakeholderRow[] = [];

  for (const sektorBucket of parsed.aggregations.sektor.buckets) {
    if (sektorBucket.key === 'Nan') continue;
    for (const orgBucket of sektorBucket.org.buckets) {
      const trimmed = orgBucket.key.trim();
      if (!trimmed) continue;
      rows.push({
        source: 'ELK',
        rawName: trimmed,
        normalizedKey: normalizeKey(trimmed),
        rawSektor: sektorBucket.key,
        hitCount: orgBucket.doc_count,
        targetCount: orgBucket.target.buckets.length,
        lastSeen: orgBucket.last_seen.value_as_string,
      });
    }
  }

  if (opts.dryRun) {
    logger.info({ rows: rows.length }, 'bootstrap-stakeholders dry run');
    return { scanned: rows.length, upserted: 0, durationMs: Date.now() - start };
  }

  if (rows.length === 0) {
    return { scanned: 0, upserted: 0, durationMs: Date.now() - start };
  }

  const session = getSession();
  let upserted = 0;
  try {
    await session.executeWrite(async (tx) => {
      const result = await tx.run(
        `UNWIND $rows AS row
         MERGE (r:RawStakeholder {tenantId: $tenantId, source: row.source, normalizedKey: row.normalizedKey})
         ON CREATE SET r.id = randomUUID(),
                       r.rawName = row.rawName,
                       r.rawSektor = row.rawSektor,
                       r.hitCount = row.hitCount,
                       r.targetCount = row.targetCount,
                       r.lastSeen = datetime(row.lastSeen),
                       r.status = 'PENDING',
                       r.createdAt = datetime()
         ON MATCH SET  r.rawName = row.rawName,
                       r.rawSektor = row.rawSektor,
                       r.hitCount = row.hitCount,
                       r.targetCount = row.targetCount,
                       r.lastSeen = datetime(row.lastSeen)
         RETURN count(r) AS upserted`,
        { tenantId: opts.tenantId, rows },
      );
      const u = result.records[0]?.get('upserted');
      upserted = typeof u === 'number' ? u : Number(u);
    });
  } finally {
    await session.close();
  }

  logger.info({ scanned: rows.length, upserted, durationMs: Date.now() - start }, 'bootstrap-stakeholders complete');
  return { scanned: rows.length, upserted, durationMs: Date.now() - start };
}
