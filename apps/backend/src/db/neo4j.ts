import neo4j, { type Driver, type Session } from 'neo4j-driver';
import { config } from '../config.js';

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      config.NEO4J_URI,
      neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD),
      {
        maxConnectionPoolSize: 100,
        connectionAcquisitionTimeout: 30_000,
        disableLosslessIntegers: true,
      },
    );
  }
  return driver;
}

export function getSession(database: string = config.NEO4J_DATABASE): Session {
  return getDriver().session({ database });
}

export async function pingDb(): Promise<boolean> {
  const session = getSession();
  try {
    const result = await session.run('RETURN 1 AS ok');
    return result.records[0]?.get('ok') === 1;
  } finally {
    await session.close();
  }
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
