import { randomUUID } from 'node:crypto';
import { getSession } from '../db/neo4j.js';
import type { StakeholderRow, StakeholderInput, SektorRow } from './types.js';

// ---------------------------------------------------------------------------
// Return fragments
// ---------------------------------------------------------------------------

const SEKTOR_RETURN = `
  s.id AS id, s.slug AS slug, s.name AS name, s.displayOrder AS displayOrder
`;

const STAKEHOLDER_RETURN = `
  k.id AS id, k.slug AS slug, k.name AS name,
  coalesce(k.aliases, []) AS aliases,
  k.city AS city, k.coords AS coords, k.notes AS notes,
  k.status AS status,
  head([(k)-[:IN_SEKTOR]->(s:Sektor) | s.id]) AS sektorId,
  k.sensorStack AS sensorStack,
  k.sensorStatus AS sensorStatus,
  k.sensorAgentCount AS sensorAgentCount,
  toString(k.sensorDeployedAt) AS sensorDeployedAt,
  k.sensorNotes AS sensorNotes,
  toString(k.createdAt) AS createdAt,
  toString(k.updatedAt) AS updatedAt
`;

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

function rowToSektor(rec: { get: (k: string) => unknown }): SektorRow {
  return {
    id: rec.get('id') as string,
    slug: rec.get('slug') as string,
    name: rec.get('name') as string,
    displayOrder: Number(rec.get('displayOrder') ?? 0),
  };
}

function rowToStakeholder(rec: { get: (k: string) => unknown }): StakeholderRow {
  const rawCoords = rec.get('coords') as [number, number] | null;
  return {
    id: rec.get('id') as string,
    slug: rec.get('slug') as string,
    name: rec.get('name') as string,
    aliases: (rec.get('aliases') as string[]) ?? [],
    city: (rec.get('city') as string | null) ?? null,
    coords: rawCoords ?? null,
    notes: (rec.get('notes') as string | null) ?? null,
    status: rec.get('status') as StakeholderRow['status'],
    sektorId: (rec.get('sektorId') as string | null) ?? null,
    sensorStack: (rec.get('sensorStack') as StakeholderRow['sensorStack']) ?? null,
    sensorStatus: (rec.get('sensorStatus') as StakeholderRow['sensorStatus']) ?? null,
    sensorAgentCount: rec.get('sensorAgentCount') != null ? Number(rec.get('sensorAgentCount')) : null,
    sensorDeployedAt: (rec.get('sensorDeployedAt') as string | null) ?? null,
    sensorNotes: (rec.get('sensorNotes') as string | null) ?? null,
    createdAt: rec.get('createdAt') as string,
    updatedAt: rec.get('updatedAt') as string,
  };
}

// ---------------------------------------------------------------------------
// Sektor queries (global — no tenantId)
// ---------------------------------------------------------------------------

export async function listSektors(): Promise<SektorRow[]> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (s:Sektor) RETURN ${SEKTOR_RETURN} ORDER BY s.displayOrder ASC, s.name ASC`,
    );
    return r.records.map(rowToSektor);
  } finally {
    await session.close();
  }
}

export async function findSektorOfStakeholder(stakeholderId: string): Promise<SektorRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (:Stakeholder {id: $stakeholderId})-[:IN_SEKTOR]->(s:Sektor)
       RETURN ${SEKTOR_RETURN}`,
      { stakeholderId },
    );
    const rec = r.records[0];
    return rec ? rowToSektor(rec) : null;
  } finally {
    await session.close();
  }
}

export async function countStakeholdersInSektor(sektorId: string, tenantId: string): Promise<number> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (k:Stakeholder)-[:IN_SEKTOR]->(:Sektor {id: $sektorId})
       WHERE k.tenantId = $tenantId
       RETURN count(k) AS n`,
      { sektorId, tenantId },
    );
    return Number(r.records[0]?.get('n') ?? 0);
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Stakeholder queries (tenant-scoped)
// ---------------------------------------------------------------------------

export async function listStakeholders(
  tenantId: string,
  filter: { sektorId?: string; status?: string; search?: string; first?: number },
): Promise<StakeholderRow[]> {
  const session = getSession();
  const limit = BigInt(filter.first ?? 50);

  try {
    let cypher: string;
    const params: Record<string, unknown> = { tenantId, limit };

    if (filter.search) {
      // fulltext index path
      params.search = filter.search;
      let where = 'WHERE k.tenantId = $tenantId';
      if (filter.sektorId) {
        params.sektorId = filter.sektorId;
        where += '\n  AND (k)-[:IN_SEKTOR]->(:Sektor {id: $sektorId})';
      }
      if (filter.status) {
        params.status = filter.status;
        where += '\n  AND k.status = $status';
      }
      cypher = `
        CALL db.index.fulltext.queryNodes('stakeholder_search', $search) YIELD node AS k, score
        ${where}
        RETURN ${STAKEHOLDER_RETURN}
        ORDER BY score DESC
        LIMIT $limit
      `;
    } else {
      // plain match path
      const conditions: string[] = ['k.tenantId = $tenantId'];
      if (filter.status) {
        params.status = filter.status;
        conditions.push('k.status = $status');
      }
      const whereClause = 'WHERE ' + conditions.join(' AND ');

      if (filter.sektorId) {
        params.sektorId = filter.sektorId;
        cypher = `
          MATCH (k:Stakeholder)-[:IN_SEKTOR]->(:Sektor {id: $sektorId})
          ${whereClause}
          RETURN ${STAKEHOLDER_RETURN}
          ORDER BY k.name ASC
          LIMIT $limit
        `;
      } else {
        cypher = `
          MATCH (k:Stakeholder)
          ${whereClause}
          RETURN ${STAKEHOLDER_RETURN}
          ORDER BY k.name ASC
          LIMIT $limit
        `;
      }
    }

    const r = await session.run(cypher, params);
    return r.records.map(rowToStakeholder);
  } finally {
    await session.close();
  }
}

export async function findStakeholder(tenantId: string, id: string): Promise<StakeholderRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (k:Stakeholder {id: $id})
       WHERE k.tenantId = $tenantId
       RETURN ${STAKEHOLDER_RETURN}`,
      { tenantId, id },
    );
    const rec = r.records[0];
    return rec ? rowToStakeholder(rec) : null;
  } finally {
    await session.close();
  }
}

export async function findStakeholderBySlug(tenantId: string, slug: string): Promise<StakeholderRow | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (k:Stakeholder {slug: $slug})
       WHERE k.tenantId = $tenantId
       RETURN ${STAKEHOLDER_RETURN}`,
      { tenantId, slug },
    );
    const rec = r.records[0];
    return rec ? rowToStakeholder(rec) : null;
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Stakeholder mutations
// ---------------------------------------------------------------------------

export async function createStakeholder(tenantId: string, input: StakeholderInput): Promise<StakeholderRow> {
  const id = randomUUID();
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      await tx.run(
        `CREATE (k:Stakeholder {
           id: $id,
           tenantId: $tenantId,
           slug: $slug,
           name: $name,
           aliases: $aliases,
           city: $city,
           coords: $coords,
           notes: $notes,
           status: 'ACTIVE',
           sensorStack: null,
           sensorStatus: null,
           sensorAgentCount: null,
           sensorDeployedAt: null,
           sensorNotes: null,
           createdAt: datetime(),
           updatedAt: datetime()
         })`,
        {
          id,
          tenantId,
          slug: input.slug,
          name: input.name,
          aliases: input.aliases ?? [],
          city: input.city ?? null,
          coords: input.coords ?? null,
          notes: input.notes ?? null,
        },
      );

      if (input.sektorId) {
        await tx.run(
          `MATCH (k:Stakeholder {id: $id}), (s:Sektor {id: $sektorId})
           MERGE (k)-[:IN_SEKTOR]->(s)`,
          { id, sektorId: input.sektorId },
        );
      }

      const r = await tx.run(
        `MATCH (k:Stakeholder {id: $id}) RETURN ${STAKEHOLDER_RETURN}`,
        { id },
      );
      return rowToStakeholder(r.records[0]!);
    });
  } finally {
    await session.close();
  }
}

// Bulk insert from CSV import. One executeWrite tx, two UNWINDs (create
// + sektor link) — no N+1. Slugs already present in this tenant are
// skipped (returned in skippedSlugs) so re-running an import is safe and
// additive. Sektor ids are pre-resolved by the parser; we still MERGE
// the edge only when sektorId is non-null.
export async function bulkCreateStakeholders(
  tenantId: string,
  rows: StakeholderInput[],
): Promise<{ createdSlugs: string[]; skippedSlugs: string[] }> {
  if (rows.length === 0) return { createdSlugs: [], skippedSlugs: [] };
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      // Which of the incoming slugs already exist for this tenant?
      const existing = await tx.run(
        `MATCH (k:Stakeholder {tenantId: $tenantId})
         WHERE k.slug IN $slugs
         RETURN collect(k.slug) AS slugs`,
        { tenantId, slugs: rows.map((r) => r.slug) },
      );
      const taken = new Set<string>(
        (existing.records[0]?.get('slugs') as string[] | undefined) ?? [],
      );

      const fresh = rows.filter((r) => !taken.has(r.slug));
      const skippedSlugs = rows.filter((r) => taken.has(r.slug)).map((r) => r.slug);
      if (fresh.length === 0) return { createdSlugs: [], skippedSlugs };

      const payload = fresh.map((r) => ({
        id: randomUUID(),
        slug: r.slug,
        name: r.name,
        aliases: r.aliases ?? [],
        city: r.city ?? null,
        notes: r.notes ?? null,
        sektorId: r.sektorId ?? null,
      }));

      await tx.run(
        `UNWIND $payload AS row
         CREATE (k:Stakeholder {
           id: row.id, tenantId: $tenantId, slug: row.slug, name: row.name,
           aliases: row.aliases, city: row.city, coords: null, notes: row.notes,
           status: 'ACTIVE',
           sensorStack: null, sensorStatus: null, sensorAgentCount: null,
           sensorDeployedAt: null, sensorNotes: null,
           createdAt: datetime(), updatedAt: datetime()
         })`,
        { payload, tenantId },
      );

      await tx.run(
        `UNWIND [r IN $payload WHERE r.sektorId IS NOT NULL] AS row
         MATCH (k:Stakeholder {id: row.id}), (s:Sektor {id: row.sektorId})
         MERGE (k)-[:IN_SEKTOR]->(s)`,
        { payload },
      );

      return { createdSlugs: fresh.map((r) => r.slug), skippedSlugs };
    });
  } finally {
    await session.close();
  }
}

export async function updateStakeholder(
  tenantId: string,
  id: string,
  input: Partial<StakeholderInput>,
): Promise<StakeholderRow> {
  const session = getSession();
  try {
    return await session.executeWrite(async (tx) => {
      // Build patch — strip undefined values so Neo4j doesn't error
      const patch: Record<string, unknown> = {};
      if (input.slug !== undefined) patch.slug = input.slug;
      if (input.name !== undefined) patch.name = input.name;
      if (input.aliases !== undefined) patch.aliases = input.aliases;
      if (input.city !== undefined) patch.city = input.city;
      if (input.coords !== undefined) patch.coords = input.coords;
      if (input.notes !== undefined) patch.notes = input.notes;

      await tx.run(
        `MATCH (k:Stakeholder {id: $id})
         WHERE k.tenantId = $tenantId
         SET k += $patch, k.updatedAt = datetime()`,
        { id, tenantId, patch },
      );

      // Handle sektorId change
      if (input.sektorId !== undefined) {
        // Remove existing IN_SEKTOR edge
        await tx.run(
          `MATCH (k:Stakeholder {id: $id})-[r:IN_SEKTOR]->(:Sektor)
           WHERE k.tenantId = $tenantId
           DELETE r`,
          { id, tenantId },
        );
        // Attach new sektor if provided and not null/empty
        if (input.sektorId) {
          await tx.run(
            `MATCH (k:Stakeholder {id: $id}), (s:Sektor {id: $sektorId})
             WHERE k.tenantId = $tenantId
             MERGE (k)-[:IN_SEKTOR]->(s)`,
            { id, tenantId, sektorId: input.sektorId },
          );
        }
      }

      const r = await tx.run(
        `MATCH (k:Stakeholder {id: $id})
         WHERE k.tenantId = $tenantId
         RETURN ${STAKEHOLDER_RETURN}`,
        { id, tenantId },
      );
      return rowToStakeholder(r.records[0]!);
    });
  } finally {
    await session.close();
  }
}

export async function archiveStakeholder(tenantId: string, id: string): Promise<StakeholderRow> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (k:Stakeholder {id: $id})
       WHERE k.tenantId = $tenantId
       SET k.status = 'ARCHIVED', k.updatedAt = datetime()
       RETURN ${STAKEHOLDER_RETURN}`,
      { id, tenantId },
    );
    return rowToStakeholder(r.records[0]!);
  } finally {
    await session.close();
  }
}

export async function setStakeholderSensor(
  tenantId: string,
  id: string,
  sensor: {
    stack: string | null;
    status: string | null;
    agentCount: number | null;
    deployedAt: string | null;
    notes: string | null;
  },
): Promise<StakeholderRow> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (k:Stakeholder {id: $id})
       WHERE k.tenantId = $tenantId
       SET k.sensorStack = $stack,
           k.sensorStatus = $status,
           k.sensorAgentCount = $agentCount,
           k.sensorDeployedAt = $deployedAt,
           k.sensorNotes = $notes,
           k.updatedAt = datetime()
       RETURN ${STAKEHOLDER_RETURN}`,
      {
        id,
        tenantId,
        stack: sensor.stack,
        status: sensor.status,
        agentCount: sensor.agentCount,
        deployedAt: sensor.deployedAt,
        notes: sensor.notes,
      },
    );
    return rowToStakeholder(r.records[0]!);
  } finally {
    await session.close();
  }
}
