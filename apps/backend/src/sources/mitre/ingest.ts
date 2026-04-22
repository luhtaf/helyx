import { getSession } from '../../db/neo4j.js';
import type { MappedMitre } from './mapper.js';

export interface IngestResult {
  intrusionSets: number;
  attackPatterns: number;
  tactics: number;
  techniqueTactics: number;
  dataSources: number;
  dataComponents: number;
  detects: number;
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

      if (mapped.tactics.length) {
        await tx.run(
          `UNWIND $rows AS row
           MERGE (t:Tactic {id: row.id})
           SET t.name = row.name,
               t.shortname = row.shortname,
               t.description = row.description,
               t.url = row.url,
               t.ordering = row.ordering,
               t.lastSeenAt = datetime()`,
          { rows: mapped.tactics },
        );
      }

      if (mapped.techniqueTactics.length) {
        await tx.run(
          `UNWIND $rows AS row
           MATCH (a:AttackPattern {id: row.techniqueId}), (t:Tactic {shortname: row.tacticShortname})
           MERGE (a)-[r:OF_TACTIC]->(t)
           SET r.lastSeenAt = datetime()`,
          { rows: mapped.techniqueTactics },
        );
      }

      if (mapped.dataSources.length) {
        await tx.run(
          `UNWIND $rows AS row
           MERGE (d:DataSource {id: row.id})
           SET d.name = row.name,
               d.description = row.description,
               d.url = row.url,
               d.platforms = row.platforms,
               d.stixId = row.stixId,
               d.lastSeenAt = datetime()`,
          { rows: mapped.dataSources },
        );
      }

      if (mapped.dataComponents.length) {
        await tx.run(
          `UNWIND $rows AS row
           MERGE (d:DataComponent {id: row.id})
           SET d.name = row.name,
               d.description = row.description,
               d.lastSeenAt = datetime()
           WITH d, row
           MATCH (ds:DataSource {stixId: row.dataSourceStixId})
           MERGE (d)-[:OF_DATA_SOURCE]->(ds)`,
          { rows: mapped.dataComponents },
        );
      }

      if (mapped.detects.length) {
        await tx.run(
          `UNWIND $rows AS row
           MATCH (dc:DataComponent {id: row.dataComponentStixId}),
                 (ap:AttackPattern {id: row.attackPatternId})
           MERGE (dc)-[:DETECTS]->(ap)`,
          { rows: mapped.detects },
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
    tactics: mapped.tactics.length,
    techniqueTactics: mapped.techniqueTactics.length,
    dataSources: mapped.dataSources.length,
    dataComponents: mapped.dataComponents.length,
    detects: mapped.detects.length,
    uses: mapped.uses.length,
    skipped: mapped.skipped,
  };
}
