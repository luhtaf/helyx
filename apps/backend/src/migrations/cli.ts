import { closeDriver } from '../db/neo4j.js';
import { logger } from '../logger.js';
import { runMigrations, showStatus } from './runner.js';

const cmd = process.argv[2] ?? 'up';

try {
  if (cmd === 'up') {
    await runMigrations();
  } else if (cmd === 'status') {
    await showStatus();
  } else {
    logger.error({ cmd }, 'unknown command — use "up" or "status"');
    process.exit(2);
  }
} catch (err) {
  logger.error({ err }, 'migration failed');
  process.exitCode = 1;
} finally {
  await closeDriver();
}
