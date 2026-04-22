import { getSession } from '../../db/neo4j.js';
import type { MappedMitre } from './mapper.js';

export interface IngestResult {
  intrusionSets: number;
  attackPatterns: number;
  uses: number;
  skipped: MappedMitre['skipped'];
}

export async function writeBundle(mapped: MappedMitre): Promise<IngestResult> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      if (mapped.intrusionSets.length) {
        await tx.run(
          `UNWIND $rows AS row
           MERGE (i:IntrusionSet {id: row.id})
           SET i.name = row.name,
               i.description = row.description,
               i.aliases = row.aliases,
               i.url = row.url,
               i.createdAt = CASE WHEN row.createdAt IS NULL THEN i.createdAt ELSE datetime(row.createdAt) END,
               i.modifiedAt = CASE WHEN row.modifiedAt IS NULL THEN i.modifiedAt ELSE datetime(row.modifiedAt) END,
               i.lastSeenAt = datetime()`,
          { rows: mapped.intrusionSets },
        );
      }

      if (mapped.attackPatterns.length) {
        await tx.run(
          `UNWIND $rows AS row
           MERGE (a:AttackPattern {id: row.id})
           SET a.name = row.name,
                a.description = row.description,
                a.url = row.url,
                a.platforms = row.platforms,
                a.detection = row.detection,
                a.dataSources = row.dataSources,
                a.killChainPhases = row.killChainPhases,
                a.isSubtechnique = row.isSubtechnique,
                a.lastSeenAt = datetime()`,
           { rows: mapped.attackPatterns },
         );
      }

      if (mapped.uses.length) {
        await tx.run(
          `UNWIND $rows AS row
           MATCH (i:IntrusionSet {id: row.intrusionSetId}),
                 (a:AttackPattern {id: row.attackPatternId})
           MERGE (i)-[u:USES]->(a)
           SET u.lastSeenAt = datetime()`,
          { rows: mapped.uses },
        );
      }
    });
  } finally {
    await session.close();
  }

  return {
    intrusionSets: mapped.intrusionSets.length,
    attackPatterns: mapped.attackPatterns.length,
    uses: mapped.uses.length,
    skipped: mapped.skipped,
  };
}
