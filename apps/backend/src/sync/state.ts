import { getSession } from '../db/neo4j.js';

export interface SyncState {
  source: string;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastModEndDate: string | null;
  cursor: string | null;
}

export async function readSyncState(source: string): Promise<SyncState | null> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (s:_SyncState {source: $source})
       RETURN s.source AS source,
              toString(s.lastSyncStartedAt) AS lastSyncStartedAt,
              toString(s.lastSyncCompletedAt) AS lastSyncCompletedAt,
              toString(s.lastModEndDate) AS lastModEndDate,
              s.cursor AS cursor`,
      { source },
    );
    const r = result.records[0];
    if (!r) return null;
    return {
      source: r.get('source'),
      lastSyncStartedAt: r.get('lastSyncStartedAt'),
      lastSyncCompletedAt: r.get('lastSyncCompletedAt'),
      lastModEndDate: r.get('lastModEndDate'),
      cursor: (r.get('cursor') as string | null) ?? null,
    };
  } finally {
    await session.close();
  }
}

export async function markSyncStart(source: string): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `MERGE (s:_SyncState {source: $source})
       ON CREATE SET s.firstStartedAt = datetime()
       SET s.lastSyncStartedAt = datetime()`,
      { source },
    );
  } finally {
    await session.close();
  }
}

export async function markSyncComplete(source: string, lastModEndDate: string): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `MERGE (s:_SyncState {source: $source})
       SET s.lastSyncCompletedAt = datetime(),
           s.lastModEndDate = datetime($lastModEndDate)`,
      { source, lastModEndDate },
    );
  } finally {
    await session.close();
  }
}

export async function setSyncCursor(source: string, cursor: string): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `MERGE (s:_SyncState {source: $source})
       SET s.cursor = $cursor, s.lastSyncCompletedAt = datetime()`,
      { source, cursor },
    );
  } finally {
    await session.close();
  }
}

export async function clearSyncCursor(source: string): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `MATCH (s:_SyncState {source: $source}) REMOVE s.cursor`,
      { source },
    );
  } finally {
    await session.close();
  }
}
