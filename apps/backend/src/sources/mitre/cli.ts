import { closeDriver } from '../../db/neo4j.js';
import { logger } from '../../logger.js';
import { syncMitre } from './sync.js';

const args = process.argv.slice(2);
const urlIdx = args.findIndex((a) => a === '--url');
const url = urlIdx >= 0 ? args[urlIdx + 1] : undefined;

try {
  await syncMitre({ url });
} catch (err) {
  logger.error({ err }, 'mitre sync failed');
  process.exitCode = 1;
} finally {
  await closeDriver();
}
