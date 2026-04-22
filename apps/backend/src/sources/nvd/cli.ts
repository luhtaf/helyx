import { closeDriver } from '../../db/neo4j.js';
import { logger } from '../../logger.js';
import { syncNvd } from './sync.js';

const args = process.argv.slice(2);

function arg(name: string): string | undefined {
  const i = args.findIndex((a) => a === `--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const since = arg('since');
const until = arg('until');
const fallbackDays = arg('fallback-days');

try {
  await syncNvd({
    since,
    until,
    fallbackDays: fallbackDays ? Number(fallbackDays) : undefined,
  });
} catch (err) {
  logger.error({ err }, 'nvd sync failed');
  process.exitCode = 1;
} finally {
  await closeDriver();
}
