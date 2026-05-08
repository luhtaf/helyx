#!/usr/bin/env node
import { logger } from '../../logger.js';
import { closeDriver } from '../../db/neo4j.js';
import { syncSpiderfoot } from './sync.js';

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const tenantId = arg('--tenant') ?? process.env.HELYX_SF_TENANT_ID;
  if (!tenantId) {
    console.error('--tenant <orgId> is required (or set HELYX_SF_TENANT_ID)');
    process.exit(2);
  }
  const organisasi = arg('--organisasi');
  const pageSizeArg = arg('--page-size');
  const maxBatchesArg = arg('--max-batches');
  const reset = process.argv.includes('--reset');

  try {
    const result = await syncSpiderfoot({
      tenantId,
      organisasi,
      pageSize: pageSizeArg ? Number(pageSizeArg) : undefined,
      maxBatches: maxBatchesArg ? Number(maxBatchesArg) : undefined,
      reset,
    });
    logger.info({ result }, 'sf-elk: sync complete');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeDriver();
  }
}

main().catch((err) => {
  logger.error({ err: String(err) }, 'sf-elk: sync failed');
  console.error(err);
  process.exit(1);
});
