import { getSession } from '../db/neo4j.js';
import { logger } from '../logger.js';
import { migrations } from './index.js';
import type { Migration } from './types.js';

const META_LABEL = '_Migration';

async function runStatement(statement: string): Promise<void> {
  const session = getSession();
  try {
    await session.run(statement);
  } finally {
    await session.close();
  }
}

async function ensureMetaConstraint(): Promise<void> {
  await runStatement(
    `CREATE CONSTRAINT migration_id_unique IF NOT EXISTS
     FOR (m:${META_LABEL}) REQUIRE m.id IS UNIQUE`,
  );
}

async function isApplied(id: string): Promise<boolean> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (m:${META_LABEL} {id: $id}) RETURN m.id AS id`,
      { id },
    );
    return result.records.length > 0;
  } finally {
    await session.close();
  }
}

async function recordMigration(m: Migration): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `MERGE (m:${META_LABEL} {id: $id})
       ON CREATE SET m.description = $description, m.appliedAt = datetime()`,
      { id: m.id, description: m.description },
    );
  } finally {
    await session.close();
  }
}

async function applyMigration(m: Migration): Promise<void> {
  for (const statement of m.up) {
    await runStatement(statement);
  }
}

export async function runMigrations(): Promise<void> {
  await ensureMetaConstraint();
  for (const m of migrations) {
    if (await isApplied(m.id)) {
      logger.info({ id: m.id }, 'migration already applied — skipping');
      continue;
    }
    logger.info({ id: m.id, description: m.description }, 'applying migration');
    await applyMigration(m);
    await recordMigration(m);
    logger.info({ id: m.id }, 'migration applied');
  }
}

export async function showStatus(): Promise<void> {
  await ensureMetaConstraint();

  const session = getSession();
  try {
    const applied = await session.run(
      `MATCH (m:${META_LABEL}) RETURN m.id AS id, m.appliedAt AS appliedAt ORDER BY m.id`,
    );
    const appliedIds = new Set(applied.records.map((r) => r.get('id') as string));

    logger.info('--- migrations ---');
    for (const m of migrations) {
      logger.info(
        { id: m.id, status: appliedIds.has(m.id) ? 'applied' : 'pending', description: m.description },
        'migration',
      );
    }

    const constraints = await session.run('SHOW CONSTRAINTS YIELD name, type, labelsOrTypes, properties');
    logger.info({ count: constraints.records.length }, '--- constraints ---');
    for (const r of constraints.records) {
      logger.info({
        name: r.get('name'),
        type: r.get('type'),
        labels: r.get('labelsOrTypes'),
        properties: r.get('properties'),
      });
    }

    const indexes = await session.run(
      'SHOW INDEXES YIELD name, type, labelsOrTypes, properties, state WHERE type <> "LOOKUP"',
    );
    logger.info({ count: indexes.records.length }, '--- indexes ---');
    for (const r of indexes.records) {
      logger.info({
        name: r.get('name'),
        type: r.get('type'),
        labels: r.get('labelsOrTypes'),
        properties: r.get('properties'),
        state: r.get('state'),
      });
    }
  } finally {
    await session.close();
  }
}
