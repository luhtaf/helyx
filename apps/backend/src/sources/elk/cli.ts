import { closeDriver } from '../../db/neo4j.js';
import { logger } from '../../logger.js';
import { syncElk } from './sync.js';

const args = process.argv.slice(2);

function arg(name: string): string | undefined {
  const i = args.findIndex((a) => a === `--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

const pageSize = arg('page-size');
const maxBatches = arg('max-batches');
const reset = flag('reset');

try {
  const result = await syncElk({
    pageSize: pageSize ? Number(pageSize) : undefined,
    maxBatches: maxBatches ? Number(maxBatches) : undefined,
    reset,
  });
  logger.info(result, 'elk sync done');
} catch (err) {
  logger.error({ err }, 'elk sync failed');
  process.exitCode = 1;
} finally {
  await closeDriver();
}
