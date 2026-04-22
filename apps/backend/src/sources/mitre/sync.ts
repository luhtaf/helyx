import { logger } from '../../logger.js';
import { markSyncComplete, markSyncStart } from '../../sync/state.js';
import { fetchEnterpriseBundle } from './client.js';
import { writeBundle } from './ingest.js';
import { mapBundle } from './mapper.js';

const SOURCE = 'mitre-attack-enterprise';

export interface SyncOptions {
  url?: string;
}

export async function syncMitre(opts: SyncOptions = {}) {
  await markSyncStart(SOURCE);
  const bundle = await fetchEnterpriseBundle(opts.url);
  logger.info({ totalObjects: bundle.objects.length }, 'mitre: bundle fetched');

  const mapped = mapBundle(bundle);
  logger.info({
    intrusionSets: mapped.intrusionSets.length,
    attackPatterns: mapped.attackPatterns.length,
    uses: mapped.uses.length,
    skipped: mapped.skipped,
  }, 'mitre: mapped');

  const result = await writeBundle(mapped);
  await markSyncComplete(SOURCE, new Date().toISOString());
  logger.info(result, 'mitre: sync complete');
  return result;
}
