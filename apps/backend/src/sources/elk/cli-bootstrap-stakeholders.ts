#!/usr/bin/env node
import { bootstrapStakeholders } from './bootstrap-stakeholders.js';
import { logger } from '../../logger.js';

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const tenantId = arg('--tenant') ?? process.env.HELYX_BOOTSTRAP_TENANT_ID;
  if (!tenantId) {
    console.error('--tenant <orgId> is required (or set HELYX_BOOTSTRAP_TENANT_ID)');
    process.exit(2);
  }
  const sinceDaysArg = arg('--since-days');
  const sinceDays = sinceDaysArg ? Number(sinceDaysArg) : 180;
  if (sinceDaysArg && (!Number.isFinite(sinceDays) || sinceDays <= 0)) {
    console.error('--since-days must be a positive integer');
    process.exit(2);
  }
  const index = arg('--index');
  const dryRun = process.argv.includes('--dry-run');

  logger.info({ tenantId, sinceDays, index, dryRun }, 'bootstrap-stakeholders starting');

  const result = await bootstrapStakeholders({ tenantId, sinceDays, index, dryRun });

  logger.info({ result }, 'bootstrap-stakeholders complete');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
