// One-off recovery: a members-page fix over-zealously DETACH DELETEd
// verify2@helyx.test (mistaken for e2e pollution). It is a real
// account. This recreates the user with its known password and
// restores the three memberships it had. Idempotent (MERGE).

import { hashPassword } from '../auth/password.js';
import { getSession, closeDriver } from '../db/neo4j.js';
import { getRedis } from '../cache/redis.js';
import { newId } from '../utils/uuid.js';

const EMAIL = 'verify2@helyx.test';
const PASSWORD = 'VerifyPass123!';
const MEMBERSHIPS = [
  { org: 'Acme Corp', role: 'OWNER' },
  { org: 'PT Telkom Indonesia', role: 'VIEWER' },
  { org: 'Direktorat Jenderal Pajak', role: 'ANALYST' },
];

async function main(): Promise<void> {
  const hash = await hashPassword(PASSWORD);
  const session = getSession();
  try {
    const r = await session.run(
      `MERGE (u:User {email: $email})
       ON CREATE SET u.id = $id, u.createdAt = datetime()
       SET u.passwordHash = $hash,
           u.displayName = coalesce(u.displayName, 'Verify Two')
       WITH u
       UNWIND $mships AS ms
       MATCH (o:Organization {name: ms.org})
       MERGE (u)-[m:MEMBER_OF]->(o)
       ON CREATE SET m.role = ms.role, m.joinedAt = datetime()
       ON MATCH SET m.role = ms.role, m.joinedAt = coalesce(m.joinedAt, datetime())
       RETURN u.id AS id, collect(o.name + ' → ' + ms.role) AS memberships`,
      { email: EMAIL, id: newId(), hash, mships: MEMBERSHIPS },
    );
    const rec = r.records[0];
    if (!rec) throw new Error('restore failed — no organizations matched by name');
    console.log('restored user:', EMAIL, '→', PASSWORD);
    console.log('user id:', rec.get('id'));
    console.log('memberships:', rec.get('memberships'));
  } finally {
    await session.close();
  }
  try {
    const redis = getRedis();
    for (const pat of ['auth:lock:*verify2*', 'auth:fail:*verify2*', 'auth:user:*']) {
      const keys = await redis.keys(pat);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log('cleared', keys.length, 'keys for', pat);
      }
    }
    redis.disconnect();
  } catch (e) {
    console.warn('redis cleanup skipped:', (e as Error).message);
  }
  await closeDriver();
}

main().catch((e) => { console.error(e); process.exit(1); });
