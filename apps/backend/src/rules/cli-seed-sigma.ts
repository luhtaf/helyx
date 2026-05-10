#!/usr/bin/env node
// Seed Sigma baseline rules into a tenant. Idempotent (MERGE on tenantId+sourceRef).
//   pnpm --filter @helyx/backend rules:seed-sigma -- --tenant <orgId>

import { logger } from '../logger.js';
import { closeDriver } from '../db/neo4j.js';
import { upsertRulesBulk } from './repo.js';
import { SIGMA_BASELINE } from './sigma-baseline.js';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const tenantId = arg('--tenant') ?? process.env.HELYX_RULES_TENANT_ID;
  if (!tenantId) {
    console.error('--tenant <orgId> is required');
    process.exit(2);
  }

  try {
    const n = await upsertRulesBulk(
      tenantId,
      SIGMA_BASELINE.map((r) => ({
        kind: r.kind,
        name: r.name,
        description: r.description ?? null,
        content: r.content,
        tags: r.tags ?? [],
        source: r.source,
        sourceRef: r.sourceRef,
        detectsTechniqueIds: r.detectsTechniqueIds,
      })),
    );
    logger.info({ tenantId, upserted: n, totalSeeds: SIGMA_BASELINE.length }, 'sigma baseline seeded');
    console.log(JSON.stringify({ upserted: n, totalSeeds: SIGMA_BASELINE.length }, null, 2));
  } finally {
    await closeDriver();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
