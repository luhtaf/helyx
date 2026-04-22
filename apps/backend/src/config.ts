import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

function findEnvFile(start: string, maxDepth = 6): string | null {
  let dir = start;
  for (let i = 0; i < maxDepth; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const here = dirname(fileURLToPath(import.meta.url));
const envPath = findEnvFile(here);
if (envPath) loadDotenv({ path: envPath });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  BACKEND_HOST: z.string().default('0.0.0.0'),
  BACKEND_PORT: z.coerce.number().int().positive().default(4000),
  NEO4J_URI: z.string().min(1),
  NEO4J_USER: z.string().min(1),
  NEO4J_PASSWORD: z.string().min(1),
  NEO4J_DATABASE: z.string().default('neo4j'),
  NVD_API_KEY: z.string().optional(),
  NVD_BASE_URL: z.string().default('https://services.nvd.nist.gov/rest/json/cves/2.0'),
  ELK_BASE_URL: z.string().default('http://elk.th'),
  ELK_USERNAME: z.string().optional(),
  ELK_PASSWORD: z.string().optional(),
  ELK_CVE_INDEX: z.string().default('list-cve'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = z.infer<typeof schema>;
