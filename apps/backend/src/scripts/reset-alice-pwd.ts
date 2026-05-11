import { hashPassword } from '../auth/password.js';
import { getSession, closeDriver } from '../db/neo4j.js';
import { getRedis } from '../cache/redis.js';

const NEW_PASSWORD = 'alice12345';
const EMAIL = 'alice@helyx.test';

async function main(): Promise<void> {
  const hash = await hashPassword(NEW_PASSWORD);
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (u:User {email: $email}) SET u.passwordHash = $hash RETURN u.id AS id`,
      { email: EMAIL, hash },
    );
    if (r.records.length === 0) throw new Error('user not found');
    console.log('reset password for', EMAIL, '→', NEW_PASSWORD);
    console.log('user id:', r.records[0]!.get('id'));
  } finally {
    await session.close();
  }
  try {
    const redis = getRedis();
    const lockKeys = await redis.keys('auth:lock:*alice*');
    if (lockKeys.length > 0) {
      await redis.del(...lockKeys);
      console.log('cleared lockout keys:', lockKeys.length);
    }
    const failKeys = await redis.keys('auth:fail:*alice*');
    if (failKeys.length > 0) {
      await redis.del(...failKeys);
      console.log('cleared fail counters:', failKeys.length);
    }
    redis.disconnect();
  } catch (e) {
    console.warn('redis cleanup skipped:', (e as Error).message);
  }
  await closeDriver();
}

main().catch((e) => { console.error(e); process.exit(1); });
